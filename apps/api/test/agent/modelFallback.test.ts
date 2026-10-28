import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { classifyFailure, createFallbackLlmClient, type ChatMessage, type ModelCall } from '../../src/agent/llmClient';

const MODELS = ['best', 'good', 'light'];
const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'I have 45 g of 22K gold' }];

const httpError = (status: number, body: unknown = {}) => Object.assign(new Error(`${status} error`), { status, error: body });
// The real SDK errors: a hand-made Error with name 'APIConnectionTimeoutError' hid a bug once.
const timeout = () => new APIConnectionTimeoutError();
const ok = (model: string) => ({ content: `answered by ${model}`, toolCalls: [] });

/** A fake provider: `failures[model]` lists what that model does on each successive call. */
function fakeProvider(failures: Record<string, Array<Error | 'ok'>>) {
  const calls: Array<{ model: string; messages: ChatMessage[] }> = [];
  const callModel: ModelCall = async (model, messages) => {
    calls.push({ model, messages });
    const next = failures[model]?.shift() ?? 'ok';
    if (next !== 'ok') throw next;
    return ok(model);
  };
  return { calls, callModel };
}

function setup(failures: Record<string, Array<Error | 'ok'>>) {
  let time = 1_000_000;
  const provider = fakeProvider(failures);
  const onFallback = vi.fn();
  const llm = createFallbackLlmClient(MODELS, provider.callModel, { now: () => time, onFallback });
  return { llm, ...provider, onFallback, advance: (ms: number) => (time += ms) };
}

describe('model fallback', () => {
  it('uses the best model when it answers', async () => {
    const { llm, calls } = setup({});
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by best');
    expect(calls.map((c) => c.model)).toEqual(['best']);
  });

  it('on a rate limit, the next model answers with the SAME messages (same context)', async () => {
    const { llm, calls, onFallback } = setup({ best: [httpError(429)] });
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by good');
    expect(calls.map((c) => c.model)).toEqual(['best', 'good']);
    expect(calls[1]!.messages).toBe(calls[0]!.messages);
    expect(onFallback).toHaveBeenCalledWith({ model: 'best', status: 429, reason: 'rate limited', cooldownMs: 60_000, next: 'good' });
  });

  it('skips a model while it cools down, then tries the best model again', async () => {
    const { llm, calls, advance } = setup({ best: [httpError(429)] });
    await llm.chat(MESSAGES, []);
    await llm.chat(MESSAGES, []); // best is cooling down: straight to good
    expect(calls.map((c) => c.model)).toEqual(['best', 'good', 'good']);

    advance(61_000);
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by best');
  });

  it("uses Gemini's retryDelay for the cool-down", async () => {
    const body = [{ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '39s' }] } }];
    const { llm, onFallback } = setup({ best: [httpError(429, body)] });
    await llm.chat(MESSAGES, []);
    expect(onFallback.mock.calls[0]![0].cooldownMs).toBe(39_000);
  });

  it.each([
    ['overloaded (503)', httpError(503)],
    ['server error (500)', httpError(500)],
    ['model not available to this key (404)', httpError(404)],
    ['timeout (model hangs)', timeout()],
  ])('falls back on %s', async (_label, error) => {
    const { llm, calls } = setup({ best: [error] });
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by good');
    expect(calls.map((c) => c.model)).toEqual(['best', 'good']);
  });

  it('walks the whole chain until one model answers', async () => {
    const { llm, calls } = setup({ best: [httpError(429)], good: [timeout()] });
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by light');
    expect(calls.map((c) => c.model)).toEqual(['best', 'good', 'light']);
  });

  it.each([
    ['bad request (400)', httpError(400)],
    ['bad API key (401)', httpError(401)],
  ])('does not fall back on %s (no model would accept it)', async (_label, error) => {
    const { llm, calls } = setup({ best: [error] });
    await expect(llm.chat(MESSAGES, [])).rejects.toBe(error);
    expect(calls.map((c) => c.model)).toEqual(['best']);
  });

  it('throws the last error when every model fails', async () => {
    const last = httpError(429);
    const { llm } = setup({ best: [httpError(503)], good: [httpError(429)], light: [last] });
    await expect(llm.chat(MESSAGES, [])).rejects.toBe(last);
  });

  it('when all models are cooling down, still tries them (soonest available first)', async () => {
    const { llm, calls } = setup({ best: [httpError(503)], good: [httpError(429), httpError(429)], light: [httpError(429)] });
    await expect(llm.chat(MESSAGES, [])).rejects.toBeDefined();
    // good and light (60 s) come back before best (120 s); good wins the tie by priority
    expect((await llm.chat(MESSAGES, [])).content).toBe('answered by light');
    expect(calls.slice(3).map((c) => c.model)).toEqual(['good', 'light']);
  });

  it('never passes conversation text to the fallback callback', async () => {
    const { llm, onFallback } = setup({ best: [httpError(429)] });
    await llm.chat(MESSAGES, []);
    expect(JSON.stringify(onFallback.mock.calls)).not.toContain('45 g');
  });
});

describe('classifyFailure', () => {
  it('reads a Retry-After header when there is no retryDelay', () => {
    const err = Object.assign(httpError(429), { headers: new Headers({ 'retry-after': '12' }) });
    expect(classifyFailure(err).cooldownMs).toBe(12_000);
  });
});

describe('classifyFailure with the real OpenAI SDK errors', () => {
  it('treats the SDK timeout and connection errors as "try the next model"', () => {
    expect(classifyFailure(new APIConnectionTimeoutError())).toMatchObject({ tryNextModel: true, reason: 'timed out' });
    expect(classifyFailure(new APIConnectionError({ message: 'socket hang up' }))).toMatchObject({ tryNextModel: true });
  });

  it('reads the status of SDK HTTP errors', () => {
    expect(classifyFailure(APIError.generate(429, { error: { message: 'quota' } }, 'quota', new Headers()))).toMatchObject({
      tryNextModel: true,
      status: 429,
    });
    expect(classifyFailure(APIError.generate(400, { error: { message: 'bad' } }, 'bad', new Headers()))).toMatchObject({
      tryNextModel: false,
      status: 400,
    });
  });

  it('does not treat an unrelated error as a timeout', () => {
    expect(classifyFailure(new TypeError('x is undefined'))).toMatchObject({ tryNextModel: false });
  });
});
