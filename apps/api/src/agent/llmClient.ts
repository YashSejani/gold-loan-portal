import OpenAI from 'openai';

// Provider-neutral message shapes, so the agent never depends on one SDK's types.
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text from the model; parsed and validated by the tool handler. */
  arguments: string;
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
  model: string;
}

/** Any OpenAI-compatible endpoint: Gemini, Groq, Ollama… (CLAUDE.md §9.1). */
export function createOpenAiLlmClient({ baseUrl, apiKey, model }: LlmConfig): LlmClient {
  const client = new OpenAI({ baseURL: baseUrl, apiKey, maxRetries: 1, timeout: 30_000 });

  return {
    async chat(messages, tools) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        messages: messages.map(toProviderMessage),
        ...(tools.length > 0
          ? { tools: tools.map((tool) => ({ type: 'function' as const, function: tool })) }
          : {}),
      });
      const message = completion.choices[0]?.message;
      return {
        content: message?.content ?? null,
        toolCalls: (message?.tool_calls ?? []).flatMap((call) =>
          call.type === 'function' ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [],
        ),
      };
    },
  };
}

function toProviderMessage(message: ChatMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
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
