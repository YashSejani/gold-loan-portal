import { Writable } from 'node:stream';
import { createAgentService } from '../../src/agent/agentService';
import type { ChatMessage, LlmClient, LlmReply } from '../../src/agent/llmClient';
import { createSessionStore } from '../../src/agent/sessionStore';
import { createLogger } from '../../src/logger';

export type Step = LlmReply | ((messages: ChatMessage[]) => LlmReply);

let callCounter = 0;
export const callTool = (name: string, args: unknown): LlmReply => ({
  content: null,
  toolCalls: [{ id: `call_${++callCounter}`, name, arguments: JSON.stringify(args) }],
});
export const say = (content: string): LlmReply => ({ content, toolCalls: [] });

/** A scripted model: returns the queued replies in order and records every request it received. */
export class FakeLlm implements LlmClient {
  readonly calls: ChatMessage[][] = [];
  private readonly steps: Step[];
  failNext = false;

  constructor(steps: Step[] = []) {
    this.steps = [...steps];
  }

  queue(...steps: Step[]) {
    this.steps.push(...steps);
  }

  async chat(messages: ChatMessage[]): Promise<LlmReply> {
    this.calls.push(JSON.parse(JSON.stringify(messages)));
    if (this.failNext) {
      this.failNext = false;
      throw new Error('provider 500: upstream overloaded');
    }
    const step = this.steps.shift() ?? say('(no scripted reply)');
    return typeof step === 'function' ? step(messages) : step;
  }

  /** Everything the model has been sent, as one string (for "never leaks" assertions). */
  everythingSent(): string {
    return JSON.stringify(this.calls);
  }

  /** Parsed tool results in the most recent request. */
  lastToolResults(): Array<Record<string, any>> {
    const last = this.calls.at(-1) ?? [];
    return last.filter((m) => m.role === 'tool').map((m) => JSON.parse((m as { content: string }).content));
  }
}

export function captureLogs() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, logger: createLogger({ level: 'info', destination }) };
}

/** An agent with a fake LLM, an in-memory store and a controllable clock. */
export function makeAgent(steps: Step[] = [], options: { logger?: ReturnType<typeof createLogger> } = {}) {
  const llm = new FakeLlm(steps);
  let time = Date.now();
  const now = () => time;
  const store = createSessionStore({ now });
  const agent = createAgentService({ llm, store, now, logChatText: true, ...(options.logger ? { logger: options.logger } : {}) });
  return { agent, llm, store, advance: (ms: number) => (time += ms) };
}

export const APPLICANT = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876543210',
  grossWeightGrams: 50,
  netWeightGrams: 45,
  karat: 22,
  planId: 'PLAN_EMI_01',
};
