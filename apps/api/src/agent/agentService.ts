import {
  formatDateShortIST,
  formatINR,
  maskMobilesInText,
  type ChatErrorDto,
  type ChatResponseDto,
  type LeadDto,
  type ToolEventDto,
} from '@goldloan/shared';
import type { Logger } from 'pino';
import { config } from '../config';
import { AppError, ConflictError, InternalError, NotFoundError } from '../lib/errors';
import { logger as defaultLogger } from '../logger';
import * as leadService from '../services/leadService';
import { createOpenAiLlmClient, type ChatMessage, type LlmClient } from './llmClient';
import { createSessionStore, type PendingSubmission, type Session, type SessionStore } from './sessionStore';
import { APP_EVENT_PREFIX, SYSTEM_PROMPT } from './systemPrompt';
import { preparePending, runTool, TOOL_DEFINITIONS, type ToolResult } from './tools';

export const MAX_TOOL_ROUNDS = 5;
export const FALLBACK_REPLY = "Sorry, I couldn't finish that. Could you say it another way?";

export interface AgentService {
  handleUserMessage(sessionId: string | undefined, text: string): Promise<ChatResponseDto>;
  /** 201 when the lead was created, 200 when creation failed for good (the reply explains why). */
  confirm(sessionId: string, pendingId: string): Promise<{ status: 200 | 201; body: ChatResponseDto }>;
  cancel(sessionId: string, pendingId: string): Promise<ChatResponseDto>;
}

export interface AgentDependencies {
  /** null when LLM_API_KEY is not set: chat answers 503, the rest of the app keeps working. */
  llm: LlmClient | null;
  store: SessionStore;
  logger?: Logger;
  now?: () => number;
  /** Full chat text is logged (masked) only outside production. */
  logChatText?: boolean;
}

interface TurnResult {
  reply: string;
  toolEvents: ToolEventDto[];
  pending?: PendingSubmission;
}

export function createAgentService({
  llm,
  store,
  logger = defaultLogger,
  now = Date.now,
  logChatText = config.nodeEnv !== 'production',
}: AgentDependencies): AgentService {
  const unavailable = () =>
    new AppError(503, 'AGENT_UNAVAILABLE', 'Loan Assist is not available right now. You can still apply with the form.');

  async function callLlm(messages: ChatMessage[]) {
    if (!llm) throw unavailable();
    try {
      return await llm.chat([{ role: 'system', content: SYSTEM_PROMPT }, ...messages], TOOL_DEFINITIONS);
    } catch (err) {
      logger.error({ err }, 'LLM call failed');
      throw unavailable();
    }
  }

  /**
   * Model ↔ tools until the model answers in text, at most MAX_TOOL_ROUNDS tool round-trips.
   * Appends to `messages` in place; the caller decides whether to keep them.
   */
  async function runTurn(sessionId: string, messages: ChatMessage[]): Promise<TurnResult> {
    const toolEvents: ToolEventDto[] = [];
    let pending: PendingSubmission | undefined;

    for (let rounds = 0; ; ) {
      const answer = await callLlm(messages);
      if (answer.toolCalls.length === 0 || rounds === MAX_TOOL_ROUNDS) {
        const reply = answer.toolCalls.length === 0 ? answer.content?.trim() || FALLBACK_REPLY : FALLBACK_REPLY;
        messages.push({ role: 'assistant', content: reply });
        return { reply, toolEvents, pending };
      }

      rounds++;
      messages.push({ role: 'assistant', content: answer.content, toolCalls: answer.toolCalls });
      for (const call of answer.toolCalls) {
        const outcome = await runTool(call.name, call.arguments, { now, logger });
        logger.info(
          { sessionId, tool: call.name, args: maskMobilesInText(call.arguments), ok: outcome.result.ok },
          'Agent tool call',
        );
        if (outcome.pending) pending = outcome.pending;
        toolEvents.push(toToolEvent(call.name, outcome.result));
        messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(outcome.result) });
      }
    }
  }

  /** Records an app event (system role, so it can't be forged by typing) and lets the model reply to it. */
  async function replyToEvent(session: Session, event: string, fallback: string): Promise<TurnResult> {
    const messages: ChatMessage[] = [...session.messages, { role: 'system', content: `${APP_EVENT_PREFIX} ${event}` }];
    try {
      const turn = await runTurn(session.id, messages);
      session.messages = messages;
      if (turn.pending) session.pending = turn.pending;
      return turn;
    } catch {
      // The decision already happened (e.g. the lead exists): answer with a template instead of failing.
      session.messages = [...messages, { role: 'assistant', content: fallback }];
      return { reply: fallback, toolEvents: [] };
    }
  }

  function takePending(sessionId: string, pendingId: string): { session: Session; pending: PendingSubmission } {
    const session = store.get(sessionId);
    const pending = session?.pending;
    if (!session || !pending || pending.pendingId !== pendingId || pending.locked || pending.expiresAt <= now()) {
      if (session && pending?.pendingId === pendingId && pending.expiresAt <= now()) session.pending = null;
      throw new NotFoundError(
        'PENDING_NOT_FOUND',
        'This confirmation has expired or was already used. Ask Loan Assist to prepare the application again.',
      );
    }
    store.touch(session);
    return { session, pending };
  }

  const respond = (session: Session, turn: TurnResult) => ({
    sessionId: session.id,
    messages: [{ role: 'assistant' as const, content: turn.reply }],
    toolEvents: turn.toolEvents,
    ...(turn.pending ? { pendingConfirmation: { pendingId: turn.pending.pendingId, summary: turn.pending.summary } } : {}),
  });

  return {
    async handleUserMessage(sessionId, text) {
      const session = (sessionId ? store.get(sessionId) : null) ?? store.create();
      if (logChatText) logger.info({ sessionId: session.id, message: maskMobilesInText(text) }, 'Chat message');

      const messages: ChatMessage[] = [...session.messages, { role: 'user', content: text }];
      const turn = await runTurn(session.id, messages);

      // Only a completed turn is kept, so a failed LLM call leaves history and pending untouched.
      session.messages = messages;
      if (turn.pending) session.pending = turn.pending; // replaces any earlier, unconfirmed one
      store.touch(session);
      return respond(session, turn);
    },

    async confirm(sessionId, pendingId) {
      const { session, pending } = takePending(sessionId, pendingId);
      pending.locked = true; // synchronously, before any await: a second click finds it locked

      let created: LeadDto;
      try {
        // Quote drift: re-quote now and compare with the numbers the user was shown (server-side, not client data).
        const fresh = await preparePending(pending.payload, now);
        if (quoteChanged(pending, fresh)) {
          session.pending = fresh;
          session.messages.push({
            role: 'system',
            content: `${APP_EVENT_PREFIX} The quote changed before the user confirmed, so nothing was submitted. The user was shown this new summary to confirm: ${JSON.stringify(fresh.summary)}`,
          });
          throw new ConflictError(
            'QUOTE_CHANGED',
            'The quote changed since you reviewed it. Please check the new numbers and confirm again.',
            [],
            { pendingConfirmation: { pendingId: fresh.pendingId, summary: fresh.summary } },
          );
        }
        // The same function POST /leads uses: validation, plan, duplicate check, recalculation, insert.
        created = await leadService.create(pending.payload, { channel: 'AGENT' });
      } catch (err) {
        if (err instanceof AppError && err.code === 'QUOTE_CHANGED') throw err;

        if (isFinalError(err)) {
          session.pending = null; // consumed: confirming it again can't help
          const error: ChatErrorDto = {
            code: err.code,
            message: err.message,
            fields: err.fields,
            ...(err.details ? { details: err.details } : {}),
          };
          logger.info({ sessionId, code: err.code }, 'Agent confirm failed');
          const template = failureTemplate(error);
          const turn = await replyToEvent(
            session,
            `The user pressed Confirm, but the application was NOT created. Error: ${JSON.stringify(error)}`,
            template,
          );
          // Never let the reply claim success when nothing was created.
          const reply = /submitted/i.test(turn.reply) ? template : turn.reply;
          return { status: 200, body: { ...respond(session, { ...turn, reply }), outcome: { status: 'FAILED', error } } };
        }

        // Temporary (5xx): keep the pending item valid so the user can press Confirm again. The model isn't told.
        pending.locked = false;
        const safe = err instanceof AppError ? err : new InternalError();
        if (!(err instanceof AppError)) logger.error({ err }, 'Agent confirm failed unexpectedly');
        throw new AppError(safe.status, safe.code, safe.message, [], { retryable: true, pendingId });
      }

      session.pending = null;
      logger.info({ sessionId, applicationId: created.applicationId }, 'Agent lead created');
      const turn = await replyToEvent(
        session,
        `The user pressed Confirm and the application was created: ${JSON.stringify({
          applicationId: created.applicationId,
          status: created.status,
          planName: created.planName,
          eligibleLoan: created.eligibleLoan,
          eligibleLoanDisplay: formatINR(created.eligibleLoan),
        })}`,
        `Your application ${created.applicationId} has been submitted, with an eligible loan of ${formatINR(created.eligibleLoan)} on the ${created.planName} plan. This is a preliminary offer; the final amount depends on a physical check of your jewellery.`,
      );
      return { status: 201, body: { ...respond(session, turn), outcome: { status: 'CREATED', lead: created } } };
    },

    async cancel(sessionId, pendingId) {
      const { session } = takePending(sessionId, pendingId);
      session.pending = null;
      const turn = await replyToEvent(
        session,
        'The user pressed Cancel. The prepared application was discarded and nothing was sent.',
        'Okay, I have discarded that application. Nothing was sent. Would you like to change anything?',
      );
      return { ...respond(session, turn), outcome: { status: 'CANCELLED' } };
    },
  };
}

/** Wires the real provider from config (or none when LLM_API_KEY is missing). */
export function createDefaultAgentService(): AgentService {
  return createAgentService({
    llm: config.llm.apiKey
      ? createOpenAiLlmClient(config.llm, {
          onFallback: ({ model, status, reason, cooldownMs, next }) =>
            defaultLogger.warn({ model, status, reason, cooldownSeconds: Math.round(cooldownMs / 1000), next }, 'LLM model unavailable, falling back'),
        })
      : null,
    store: createSessionStore(),
  });
}

function quoteChanged(before: PendingSubmission, after: PendingSubmission): boolean {
  return (
    before.quoted.ratePaisePerGram !== after.quoted.ratePaisePerGram ||
    before.quoted.appliedLtvBps !== after.quoted.appliedLtvBps ||
    before.quoted.eligibleLoanRupees !== after.quoted.eligibleLoanRupees
  );
}

/** 400/404/409: retrying the same confirmation can't succeed. 5xx are temporary. */
function isFinalError(err: unknown): err is AppError {
  return err instanceof AppError && [400, 404, 409].includes(err.status);
}

function failureTemplate(error: ChatErrorDto): string {
  switch (error.code) {
    case 'DUPLICATE_APPLICATION': {
      const date = typeof error.details?.existingSubmittedAt === 'string' ? formatDateShortIST(error.details.existingSubmittedAt) : '';
      return `You already applied${date ? ` on ${date}` : ''}, application ${String(error.details?.existingApplicationId ?? '')}, so a new application was not created.`;
    }
    case 'PLAN_NOT_FOUND':
      return 'That plan is no longer available, so the application was not created. Would you like to see the plans available now?';
    case 'VALIDATION_ERROR':
      return `The application was not created because some details need fixing: ${error.fields.map((f) => f.message).join('; ') || error.message}.`;
    default:
      return 'The application was not created. Please try again.';
  }
}

function toToolEvent(tool: string, result: ToolResult): ToolEventDto {
  if (!result.ok) return { tool, status: 'error', result: result.error };
  const { ok: _ok, ...rest } = result;
  return { tool, status: 'ok', result: rest };
}
