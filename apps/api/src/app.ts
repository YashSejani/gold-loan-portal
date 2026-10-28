import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { createDefaultAgentService, type AgentService } from './agent/agentService';
import { config } from './config';
import { createHttpLogger, logger as defaultLogger } from './logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { createChatRouter } from './routes/chat';
import { healthRouter } from './routes/health';
import { leadsRouter } from './routes/leads';
import { quotesRouter } from './routes/quotes';
import { schemesRouter } from './routes/schemes';

export interface AppOptions {
  logger?: Logger;
  /** Loan Assist; tests pass one with a fake LLM. */
  agent?: AgentService;
  /** Extra routes mounted under /api/v1 before the 404 handler (tests only). */
  extraRoutes?: Router;
}

export function createApp({ logger = defaultLogger, extraRoutes, agent = createDefaultAgentService() }: AppOptions = {}) {
  const app = express();

  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  const api = Router();
  api.use('/health', healthRouter);
  api.use('/loan-schemes', schemesRouter);
  api.use('/quotes', quotesRouter);
  api.use('/leads', leadsRouter);
  api.use('/chat', createChatRouter(agent));
  if (extraRoutes) api.use(extraRoutes);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
