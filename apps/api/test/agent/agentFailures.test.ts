import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, NotFoundError } from '../../src/lib/errors';
import * as quoteService from '../../src/services/quoteService';
import { prisma, truncateLeads } from '../helpers/db';
import { APPLICANT, callTool, makeAgent, say } from './fakeLlm';

// Make quoteService.calculate stubbable for the agent (ESM exports can't be spied on directly).
vi.mock('../../src/services/quoteService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/quoteService')>();
  return { ...actual, calculate: vi.fn(actual.calculate) };
});
const calculate = vi.mocked(quoteService.calculate);

const SECRET = 'connection to postgres://goldloan:hunter2@db:5432 refused';

beforeEach(async () => {
  await truncateLeads();
  calculate.mockClear();
});

async function prepareApplication(setup: ReturnType<typeof makeAgent>) {
  setup.llm.queue(callTool('submit_application', APPLICANT), say('Please check and press Confirm.'));
  const response = await setup.agent.handleUserMessage(undefined, 'apply');
  return { response, sessionId: response.sessionId, pendingId: response.pendingConfirmation?.pendingId ?? '' };
}

describe('agent error paths (CLAUDE.md §9.2)', () => {
  it('submit_application when quoteService throws 404 → ok:false to the model, no pending', async () => {
    calculate.mockRejectedValueOnce(
      new NotFoundError('PLAN_NOT_FOUND', 'The selected loan plan is not available.', [
        { field: 'planId', message: 'This loan plan is not available' },
      ]),
    );
    const setup = makeAgent();
    const { response } = await prepareApplication(setup);
    expect(response.pendingConfirmation).toBeUndefined();
    expect(setup.llm.lastToolResults()[0]).toMatchObject({ ok: false, error: { code: 'PLAN_NOT_FOUND' } });
  });

  it('503 at confirm → no lead, pending stays valid; confirming again after recovery creates one lead', async () => {
    const setup = makeAgent();
    const { sessionId, pendingId } = await prepareApplication(setup);
    const callsBefore = setup.llm.calls.length;

    calculate.mockRejectedValueOnce(new AppError(503, 'GOLD_RATE_UNAVAILABLE', 'The gold rate is unavailable right now.'));
    await expect(setup.agent.confirm(sessionId, pendingId)).rejects.toMatchObject({
      status: 503,
      code: 'GOLD_RATE_UNAVAILABLE',
      details: { retryable: true, pendingId },
    });
    expect(await prisma.lead.count()).toBe(0);
    expect(setup.llm.calls.length).toBe(callsBefore); // the model was not involved

    const { status } = await setup.agent.confirm(sessionId, pendingId);
    expect(status).toBe(201);
    expect(await prisma.lead.count()).toBe(1);
  });

  it('500 at confirm → generic error, no lead, and the internal text never reaches the model', async () => {
    const setup = makeAgent();
    const { sessionId, pendingId } = await prepareApplication(setup);

    calculate.mockRejectedValueOnce(new Error(SECRET));
    const error = await setup.agent.confirm(sessionId, pendingId).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
    expect(JSON.stringify(error)).not.toContain('hunter2');
    expect(await prisma.lead.count()).toBe(0);

    // Still retryable; and nothing the model ever received mentions the internal error.
    setup.llm.queue(say('Your application is confirmed.'));
    await setup.agent.confirm(sessionId, pendingId);
    expect(setup.llm.everythingSent()).not.toMatch(/hunter2|postgres:\/\//);
  });

  it('500 inside a tool during chat → the model gets only the generic message', async () => {
    calculate.mockRejectedValueOnce(new Error(SECRET));
    const setup = makeAgent([callTool('calculate_quote', { netWeightGrams: 45, grossWeightGrams: 50, karat: 22 }), say('Sorry, try again.')]);
    await setup.agent.handleUserMessage(undefined, 'quote 45 g');
    expect(setup.llm.lastToolResults()[0]).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', fields: [] },
    });
    expect(setup.llm.everythingSent()).not.toMatch(/hunter2|postgres:\/\//);
  });
});
