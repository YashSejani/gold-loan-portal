const nodeEnv = process.env.NODE_ENV ?? 'development';

// gemini-2.5-* is closed to new API keys; best Gemini 3 model first, lighter ones as fallbacks.
const DEFAULT_LLM_MODELS = 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  logLevel: nodeEnv === 'test' ? 'silent' : 'info',
  /** Mock 24K rate in paise per gram (CLAUDE.md §4.2). Validated in goldRateService. */
  goldRate24kPaisePerGram: process.env.GOLD_RATE_24K_PAISE_PER_GRAM || '700000',
  /** OpenAI-compatible endpoint for Loan Assist (CLAUDE.md §9.1). Never sent to the browser. */
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.LLM_API_KEY || '',
    /** Comma-separated, best first; later ones are fallbacks for rate limits / overload. */
    models: (process.env.LLM_MODEL || DEFAULT_LLM_MODELS)
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
  },
};
