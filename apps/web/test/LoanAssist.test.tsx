import type { ChatResponseDto, PendingSummaryDto } from '@goldloan/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplyPage } from '../src/pages/Apply';
import { CREATED_LEAD, json, quoteFor } from './helpers/api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SESSION = '0b6b9f8e-3c1f-4a4e-9a51-1f2d3c4b5a69';
const PENDING = '7d1f0c52-8a3e-4c8b-b0f1-2e9d6a5c4b3a';
const NEW_PENDING = '9e2a1b3c-4d5e-4f60-8172-a3b4c5d6e7f8';

const SUMMARY: PendingSummaryDto = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876XXXX10',
  grossWeightGrams: 50,
  netWeightGrams: 45,
  karat: 22,
  planId: 'PLAN_EMI_01',
  planName: 'Monthly EMI',
  repaymentType: 'EMI',
  annualInterestRate: 10.5,
  tenureMonths: 12,
  rate24kPerGram: 7000,
  pureGoldGrams: 41.25,
  goldValueRupees: 288750,
  appliedLtv: 0.75,
  eligibleLoan: 216562,
  expiresAt: '2026-10-28T10:00:00.000Z',
};

const reply = (content: string, extra: Partial<ChatResponseDto> = {}): ChatResponseDto => ({
  sessionId: SESSION,
  messages: [{ role: 'assistant', content }],
  toolEvents: [],
  ...extra,
});
const withCard = reply('Here is the summary. Please press Confirm.', {
  pendingConfirmation: { pendingId: PENDING, summary: SUMMARY },
});

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

/** Routes /chat, /chat/confirm and /chat/cancel to queued handlers; records request bodies. */
function mockChatApi(queues: { chat?: Handler[]; confirm?: Handler[]; cancel?: Handler[] }) {
  const bodies: Record<string, Array<Record<string, unknown>>> = { chat: [], confirm: [], cancel: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const route = url.endsWith('/chat/confirm') ? 'confirm' : url.endsWith('/chat/cancel') ? 'cancel' : url.endsWith('/chat') ? 'chat' : null;
      if (!route) return json(200, { data: quoteFor(body) });
      bodies[route]!.push(body);
      const handler = queues[route]?.shift();
      return handler ? handler(body) : json(500, { error: { code: 'INTERNAL_ERROR', message: 'No handler', fields: [] } });
    }),
  );
  return bodies;
}

/** The visible chat bubble (each reply is also copied into the screen reader status region). */
const findBubble = (text: string) => screen.findByText(text, { ignore: '[role=status], script, style' });

async function openChat() {
  render(<ApplyPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Chat with Loan Assist' }));
  return screen.getByRole('dialog', { name: 'Loan Assist' });
}

async function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText('Message Loan Assist'), { target: { value: text } });
  fireEvent.submit(screen.getByLabelText('Message Loan Assist').closest('form')!);
}

describe('Loan Assist panel', () => {
  it('opens as a dialog with starter chips; a chip sends the message and shows the reply', async () => {
    const bodies = mockChatApi({ chat: [() => json(200, reply('You can borrow up to ₹2,16,562 on the EMI plan.'))] });
    const dialog = await openChat();
    expect(screen.getByLabelText('Message Loan Assist')).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'I have 45 g of 22K gold, how much can I get?' }));
    expect(screen.getByText('Loan Assist is typing')).toBeInTheDocument();
    expect(screen.getByLabelText('Message Loan Assist')).toBeDisabled();

    expect(await findBubble('You can borrow up to ₹2,16,562 on the EMI plan.')).toBeInTheDocument();
    expect(screen.queryByText('Loan Assist is typing')).toBeNull();
    expect(bodies.chat[0]).toEqual({ message: 'I have 45 g of 22K gold, how much can I get?' });
    // the newest reply is announced
    expect(screen.getByText('You can borrow up to ₹2,16,562 on the EMI plan.', { selector: '[role=status]' })).toBeInTheDocument();
  });

  it('sends with Enter, then reuses the sessionId', async () => {
    const bodies = mockChatApi({ chat: [() => json(200, reply('Hello!')), () => json(200, reply('Sure.'))] });
    await openChat();
    await sendMessage('hi');
    await findBubble('Hello!');
    await sendMessage('what plans?');
    await findBubble('Sure.');
    expect(bodies.chat).toEqual([{ message: 'hi' }, { message: 'what plans?', sessionId: SESSION }]);
  });

  it('renders a quote card from the tool result, not from the model text', async () => {
    const quote = quoteFor({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
    mockChatApi({
      chat: [
        () =>
          json(200, reply('You can get about ₹9,99,999!', { toolEvents: [{ tool: 'calculate_quote', status: 'ok', result: { quote } }] })),
      ],
    });
    await openChat();
    await sendMessage('45 g 22K');
    const card = await screen.findByRole('region', { name: 'Quote for 45 g of 22K gold' });
    expect(within(card).getByText('41.25 g')).toBeInTheDocument();
    expect(within(card).getByText('₹2,88,750')).toBeInTheDocument();
    expect(within(card).getByText('₹2,16,562')).toBeInTheDocument();
    expect(within(card).getByText('₹2,02,125')).toBeInTheDocument();
    expect(within(card).queryByText(/9,99,999/)).toBeNull();
  });

  it('shows the full confirmation summary; Confirm & submit disables both buttons and shows the application id', async () => {
    let release: (r: Response) => void = () => {};
    const bodies = mockChatApi({
      chat: [() => json(200, withCard)],
      confirm: [() => new Promise<Response>((resolve) => (release = resolve))],
    });
    await openChat();
    await sendMessage('apply me');
    const card = await screen.findByRole('region', { name: 'Confirm your application' });
    for (const text of ['Ravi Kumar', '9876XXXX10', '50 g', '45 g', '22K', 'Monthly EMI', '41.25 g', '₹2,88,750', '₹2,16,562']) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }

    fireEvent.click(within(card).getByRole('button', { name: 'Confirm & submit' }));
    expect(within(card).getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(bodies.confirm).toEqual([{ sessionId: SESSION, pendingId: PENDING }]);

    await act(async () =>
      release(json(201, reply('Your application GL-1001 has been submitted.', { outcome: { status: 'CREATED', lead: CREATED_LEAD } }))),
    );
    expect(within(card).getByText('Application ID')).toBeInTheDocument();
    expect(within(card).getByText('GL-1001')).toBeInTheDocument();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(await findBubble('Your application GL-1001 has been submitted.')).toBeInTheDocument();
  });

  it('duplicate → the friendly "already applied" text, never raw codes', async () => {
    mockChatApi({
      chat: [() => json(200, withCard)],
      confirm: [
        () =>
          json(
            200,
            reply('It looks like you have already applied.', {
              outcome: {
                status: 'FAILED',
                error: {
                  code: 'DUPLICATE_APPLICATION',
                  message: 'An application from this mobile number was already submitted in the last 7 days.',
                  fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
                  details: { existingApplicationId: 'GL-1042', existingSubmittedAt: '2026-10-03T06:00:00.000Z' },
                },
              },
            }),
          ),
      ],
    });
    await openChat();
    await sendMessage('apply me');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm & submit' }));
    expect(await screen.findByText('You already applied on 3 Oct, application GL-1042.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/409|DUPLICATE_APPLICATION/);
  });

  it('Cancel → /chat/cancel and the card says nothing was sent', async () => {
    const bodies = mockChatApi({
      chat: [() => json(200, withCard)],
      cancel: [() => json(200, reply('No problem, discarded.', { outcome: { status: 'CANCELLED' } }))],
    });
    await openChat();
    await sendMessage('apply me');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Cancelled. Nothing was sent.')).toBeInTheDocument();
    expect(bodies.cancel).toEqual([{ sessionId: SESSION, pendingId: PENDING }]);
    expect(screen.queryByRole('button', { name: 'Confirm & submit' })).toBeNull();
  });

  it('a temporary failure (503) re-enables the card with "try Confirm again"', async () => {
    mockChatApi({
      chat: [() => json(200, withCard)],
      confirm: [
        () =>
          json(503, {
            error: { code: 'GOLD_RATE_UNAVAILABLE', message: 'Rate down', fields: [], details: { retryable: true, pendingId: PENDING } },
          }),
      ],
    });
    await openChat();
    await sendMessage('apply me');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm & submit' }));
    expect(await screen.findByText('Something went wrong, try Confirm again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm & submit' })).toBeEnabled();
  });

  it('QUOTE_CHANGED → the old card is replaced by a new one with the new numbers', async () => {
    mockChatApi({
      chat: [() => json(200, withCard)],
      confirm: [
        () =>
          json(409, {
            error: {
              code: 'QUOTE_CHANGED',
              message: 'The quote changed.',
              fields: [],
              details: { pendingConfirmation: { pendingId: NEW_PENDING, summary: { ...SUMMARY, rate24kPerGram: 6500, eligibleLoan: 201093 } } },
            },
          }),
      ],
    });
    await openChat();
    await sendMessage('apply me');
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm & submit' }));
    expect(await screen.findByText(/The quote changed before you confirmed/)).toBeInTheDocument();
    const cards = screen.getAllByRole('region', { name: 'Confirm your application' });
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).queryByRole('button')).toBeNull();
    expect(within(cards[1]!).getByText('₹2,01,093')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('button', { name: 'Confirm & submit' })).toBeEnabled();
  });

  it('a failed message shows an error bubble with Retry, which resends without duplicating it', async () => {
    const bodies = mockChatApi({
      chat: [
        () => json(503, { error: { code: 'AGENT_UNAVAILABLE', message: 'Loan Assist is not available right now.', fields: [] } }),
        () => json(200, reply('Back online!')),
      ],
    });
    await openChat();
    await sendMessage('hello');
    expect(await screen.findByRole('alert')).toHaveTextContent('Loan Assist is not available right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findBubble('Back online!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('hello')).toHaveLength(1);
    expect(bodies.chat).toHaveLength(2);
  });

  it('Escape closes the panel, returns focus to the button, and keeps the conversation', async () => {
    mockChatApi({ chat: [() => json(200, reply('Hello!'))] });
    const dialog = await openChat();
    await sendMessage('hi');
    await findBubble('Hello!');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chat with Loan Assist' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Chat with Loan Assist' }));
    expect(within(screen.getByRole('dialog')).getByText('Hello!', { ignore: '[role=status]' })).toBeInTheDocument();
  });
});
