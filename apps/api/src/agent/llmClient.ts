import OpenAI, { APIConnectionError } from 'openai';

// Provider-neutral message shapes, so the agent never depends on one SDK's types.
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text from the model; parsed and validated by the tool handler. */
  arguments: string;
  /**
   * The provider's original tool-call object, sent back unchanged in later turns. Gemini 3 puts a
   * thought signature in it (extra_content.google.thought_signature) and rejects history without it.
   */
  providerData?: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmReply {
  content: string | null;
  toolCalls: ToolCall[];
}

/** Anything that can answer a chat turn with optional tool calls (real provider or a test fake). */
export interface LlmClient {
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmReply>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  /** Models in priority order: the best first, fallbacks after it. */
  models: string[];
}

/** One request to one model; rejects with the provider's error (which carries an HTTP `status`). */
export type ModelCall = (model: string, messages: ChatMessage[], tools: ToolDefinition[]) => Promise<LlmReply>;

/** Per-attempt limit. A model that hangs (overloaded) costs this once, then cools down. */
const ATTEMPT_TIMEOUT_MS = 25_000;

/** Any OpenAI-compatible endpoint: Gemini, Groq, Ollama… (CLAUDE.md §9.1), with model fallback. */
export function createOpenAiLlmClient({ baseUrl, apiKey, models }: LlmConfig, options: FallbackOptions = {}): LlmClient {
  // No SDK retries: falling back to the next model replaces retrying the same overloaded one.
  const client = new OpenAI({ baseURL: baseUrl, apiKey, maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS });

  const callModel: ModelCall = async (model, messages, tools) => {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: messages.map(toProviderMessage),
      ...(tools.length > 0 ? { tools: tools.map((tool) => ({ type: 'function' as const, function: tool })) } : {}),
    });
    const message = completion.choices[0]?.message;
    return {
      content: message?.content ?? null,
      toolCalls: (message?.tool_calls ?? []).flatMap((call) =>
        call.type === 'function'
          ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments, providerData: { ...call } }]
          : [],
      ),
    };
  };

  return createFallbackLlmClient(models, callModel, options);
}

export interface FallbackOptions {
  now?: () => number;
  /** Told which model failed and which one is tried next (never the conversation text). */
  onFallback?: (event: { model: string; status: number | null; reason: string; cooldownMs: number; next: string | null }) => void;
}

/**
 * Tries models in priority order with the SAME messages. Rate limits (429), overload (5xx), timeouts and
 * models the key can't use (403/404) move on to the next model, and that model sits out a cool-down so the
 * following requests skip it. Once the cool-down ends the best model is tried first again. Request errors
 * that no model would accept (400 bad request, 401 bad key) are thrown straight away.
 */
export function createFallbackLlmClient(models: string[], callModel: ModelCall, { now = Date.now, onFallback }: FallbackOptions = {}): LlmClient {
  if (models.length === 0) throw new Error('At least one LLM model is required');
  const coolingUntil = new Map<string, number>();

  return {
    async chat(messages, tools) {
      // Rested models first (in priority order); if all are cooling down, try the soonest-available anyway.
      const time = now();
      const rested = models.filter((model) => (coolingUntil.get(model) ?? 0) <= time);
      const order = rested.length > 0 ? rested : [...models].sort((a, b) => coolingUntil.get(a)! - coolingUntil.get(b)!);

      let lastError: unknown;
      for (const [index, model] of order.entries()) {
        try {
          const reply = await callModel(model, messages, tools);
          coolingUntil.delete(model);
          return reply;
        } catch (err) {
          const failure = classifyFailure(err);
          if (!failure.tryNextModel) throw err;
          lastError = err;
          coolingUntil.set(model, now() + failure.cooldownMs);
          onFallback?.({ model, status: failure.status, reason: failure.reason, cooldownMs: failure.cooldownMs, next: order[index + 1] ?? null });
        }
      }
      throw lastError;
    },
  };
}

interface Failure {
  tryNextModel: boolean;
  status: number | null;
  reason: string;
  cooldownMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export function classifyFailure(err: unknown): Failure {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null;

  if (status === 429) return { tryNextModel: true, status, reason: 'rate limited', cooldownMs: retryDelayMs(err) ?? MINUTE };
  if (status === 403 || status === 404) return { tryNextModel: true, status, reason: 'model not available', cooldownMs: 60 * MINUTE };
  if (status !== null && status >= 500) return { tryNextModel: true, status, reason: 'provider error', cooldownMs: 2 * MINUTE };
  // No HTTP status: timeout or connection failure (an overloaded model often just hangs).
  // The SDK's timeout error extends APIConnectionError; its `name` is not the class name, so check the class.
  if (status === null && err instanceof APIConnectionError) return { tryNextModel: true, status, reason: 'timed out', cooldownMs: 2 * MINUTE };
  return { tryNextModel: false, status, reason: 'request rejected', cooldownMs: 0 };
}

/** Gemini sends RetryInfo { retryDelay: "39s" } in the error body; also honour a Retry-After header. */
function retryDelayMs(err: unknown): number | null {
  const text = JSON.stringify((err as { error?: unknown })?.error ?? '') + String((err as Error)?.message ?? '');
  const delay = /retryDelay\\?"?\s*:\s*\\?"(\d+(?:\.\d+)?)s/.exec(text);
  if (delay) return Math.ceil(Number(delay[1]) * SECOND);
  const header = (err as { headers?: { get?: (name: string) => string | null } })?.headers?.get?.('retry-after');
  return header && /^\d+$/.test(header) ? Number(header) * SECOND : null;
}

export function toProviderMessage(message: ChatMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                ...call.providerData, // keeps provider extras such as Gemini thought signatures
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}
