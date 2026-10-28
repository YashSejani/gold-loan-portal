const nodeEnv = process.env.NODE_ENV ?? 'development';

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
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
  },
};
