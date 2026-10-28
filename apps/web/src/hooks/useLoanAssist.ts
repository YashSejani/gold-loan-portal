import {
  formatDateShortIST,
  type ChatErrorDto,
  type ChatResponseDto,
  type LeadDto,
  type PendingConfirmationDto,
  type PendingSummaryDto,
  type QuoteDto,
} from '@goldloan/shared';
import { useCallback, useReducer, useRef } from 'react';
import { ApiError } from '../api/client';
import { postChat, postChatCancel, postChatConfirm } from '../api/endpoints';

export type ConfirmationState =
  | 'ready'
  | 'confirming'
  | 'cancelling'
  | 'created'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'replaced';

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  /** Numbers straight from the calculate_quote tool result, never parsed from model text. */
  | { kind: 'quote'; id: string; quote: QuoteDto }
  | {
      kind: 'confirmation';
      id: string;
      pendingId: string;
      summary: PendingSummaryDto;
      state: ConfirmationState;
      lead?: LeadDto;
      /** Outcome or problem shown on the card (e.g. the friendly duplicate text). */
      message?: string;
    }
  | { kind: 'error'; id: string; message: string; retryText: string };

interface ChatState {
  items: ChatItem[];
  waiting: boolean;
  /** Latest assistant text, for the screen reader live region. */
  announcement: string;
}

type Action =
  | { type: 'userSent'; text: string }
  | { type: 'waiting'; waiting: boolean }
  | { type: 'response'; response: ChatResponseDto }
  | { type: 'chatFailed'; message: string; retryText: string }
  | { type: 'removeItem'; id: string }
  | { type: 'updateConfirmation'; pendingId: string; patch: Partial<Extract<ChatItem, { kind: 'confirmation' }>> }
  | { type: 'addConfirmation'; confirmation: PendingConfirmationDto };

let nextId = 0;
const newId = () => `chat-${++nextId}`;

function confirmationItem({ pendingId, summary }: PendingConfirmationDto): ChatItem {
  return { kind: 'confirmation', id: newId(), pendingId, summary, state: 'ready' };
}

/** A newer summary replaces any card still waiting for a decision (the server keeps only one). */
function withNewConfirmation(items: ChatItem[], confirmation: PendingConfirmationDto): ChatItem[] {
  const updated = items.map((item) =>
    item.kind === 'confirmation' && item.state === 'ready' ? { ...item, state: 'replaced' as const } : item,
  );
  return [...updated, confirmationItem(confirmation)];
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'userSent':
      return { ...state, items: [...state.items, { kind: 'user', id: newId(), text: action.text }] };
    case 'waiting':
      return { ...state, waiting: action.waiting };
    case 'response': {
      const { messages, toolEvents, pendingConfirmation } = action.response;
      let items = [...state.items];
      const text = messages.map((m) => m.content).join('\n\n');
      if (text) items.push({ kind: 'assistant', id: newId(), text });
      for (const event of toolEvents) {
        const quote = (event.result as { quote?: QuoteDto } | undefined)?.quote;
        if (event.tool === 'calculate_quote' && event.status === 'ok' && quote) items.push({ kind: 'quote', id: newId(), quote });
      }
      if (pendingConfirmation) items = withNewConfirmation(items, pendingConfirmation);
      return { ...state, items, announcement: text || state.announcement };
    }
    case 'chatFailed':
      return {
        ...state,
        items: [...state.items, { kind: 'error', id: newId(), message: action.message, retryText: action.retryText }],
        announcement: action.message,
      };
    case 'removeItem':
      return { ...state, items: state.items.filter((item) => item.id !== action.id) };
    case 'updateConfirmation':
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'confirmation' && item.pendingId === action.pendingId ? { ...item, ...action.patch } : item,
        ),
      };
    case 'addConfirmation':
      return { ...state, items: withNewConfirmation(state.items, action.confirmation) };
  }
}

const GENERIC = 'Something went wrong. Please try again.';
const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : GENERIC);

/** Friendly text for a confirm that did not create a lead. Never shows raw codes. */
export function describeFailure(error: ChatErrorDto): string {
  if (error.code === 'DUPLICATE_APPLICATION') {
    const submittedAt = error.details?.existingSubmittedAt;
    const date = typeof submittedAt === 'string' ? formatDateShortIST(submittedAt) : '';
    return `You already applied${date ? ` on ${date}` : ''}, application ${String(error.details?.existingApplicationId ?? '')}.`;
  }
  if (error.code === 'VALIDATION_ERROR' && error.fields.length > 0) return error.fields.map((f) => f.message).join(' ');
  return error.message;
}

/** Loan Assist conversation: the browser only holds the session id and what to render. */
export function useLoanAssist() {
  const [state, dispatch] = useReducer(reducer, { items: [], waiting: false, announcement: '' });
  const sessionId = useRef<string | undefined>(undefined);

  const request = useCallback(async (text: string) => {
    dispatch({ type: 'waiting', waiting: true });
    try {
      const response = await postChat({ sessionId: sessionId.current, message: text });
      sessionId.current = response.sessionId;
      dispatch({ type: 'response', response });
    } catch (err) {
      dispatch({ type: 'chatFailed', message: messageOf(err), retryText: text });
    } finally {
      dispatch({ type: 'waiting', waiting: false });
    }
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      dispatch({ type: 'userSent', text });
      await request(text);
    },
    [request],
  );

  const retry = useCallback(
    async (item: Extract<ChatItem, { kind: 'error' }>) => {
      dispatch({ type: 'removeItem', id: item.id });
      await request(item.retryText);
    },
    [request],
  );

  const confirm = useCallback(async (pendingId: string) => {
    if (!sessionId.current) return;
    dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'confirming', message: undefined } });
    dispatch({ type: 'waiting', waiting: true });
    try {
      const response = await postChatConfirm({ sessionId: sessionId.current, pendingId });
      const outcome = response.outcome;
      if (outcome?.status === 'CREATED') {
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'created', lead: outcome.lead } });
      } else if (outcome?.status === 'FAILED') {
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'failed', message: describeFailure(outcome.error) } });
      }
      dispatch({ type: 'response', response });
    } catch (err) {
      const pending = err instanceof ApiError ? (err.details?.pendingConfirmation as PendingConfirmationDto | undefined) : undefined;
      if (err instanceof ApiError && err.code === 'QUOTE_CHANGED' && pending) {
        dispatch({
          type: 'updateConfirmation',
          pendingId,
          patch: { state: 'replaced', message: 'The quote changed before you confirmed. Please check the updated summary below.' },
        });
        dispatch({ type: 'addConfirmation', confirmation: pending });
      } else if (err instanceof ApiError && err.code === 'PENDING_NOT_FOUND') {
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'expired', message: err.message } });
      } else {
        // 500/503/network: the server kept the confirmation valid, so the same card can be confirmed again.
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'ready', message: 'Something went wrong, try Confirm again.' } });
      }
    } finally {
      dispatch({ type: 'waiting', waiting: false });
    }
  }, []);

  const cancel = useCallback(async (pendingId: string) => {
    if (!sessionId.current) return;
    dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'cancelling', message: undefined } });
    dispatch({ type: 'waiting', waiting: true });
    try {
      const response = await postChatCancel({ sessionId: sessionId.current, pendingId });
      dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'cancelled' } });
      dispatch({ type: 'response', response });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PENDING_NOT_FOUND') {
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'expired', message: err.message } });
      } else {
        dispatch({ type: 'updateConfirmation', pendingId, patch: { state: 'ready', message: 'Could not cancel. Please try again.' } });
      }
    } finally {
      dispatch({ type: 'waiting', waiting: false });
    }
  }, []);

  return { ...state, send, retry, confirm, cancel };
}
