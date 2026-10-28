import { describe, expect, it } from 'vitest';
import { toProviderMessage } from '../../src/agent/llmClient';

describe('toProviderMessage', () => {
  it('sends provider extras on tool calls back unchanged (Gemini 3 thought signatures)', () => {
    const message = toProviderMessage({
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id: 'call_1',
          name: 'calculate_quote',
          arguments: '{"netWeightGrams":45,"grossWeightGrams":50,"karat":22}',
          providerData: {
            id: 'call_1',
            type: 'function',
            function: { name: 'calculate_quote', arguments: '{}' },
            extra_content: { google: { thought_signature: 'sig-abc' } },
          },
        },
      ],
    });
    expect(message).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'calculate_quote', arguments: '{"netWeightGrams":45,"grossWeightGrams":50,"karat":22}' },
          extra_content: { google: { thought_signature: 'sig-abc' } },
        },
      ],
    });
  });

  it('works without provider extras (OpenAI, Groq, Ollama, test fakes)', () => {
    expect(
      toProviderMessage({ role: 'assistant', content: null, toolCalls: [{ id: 'c', name: 'get_loan_schemes', arguments: '{}' }] }),
    ).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c', type: 'function', function: { name: 'get_loan_schemes', arguments: '{}' } }],
    });
    expect(toProviderMessage({ role: 'tool', toolCallId: 'c', content: '{"ok":true}' })).toEqual({
      role: 'tool',
      tool_call_id: 'c',
      content: '{"ok":true}',
    });
  });
});
