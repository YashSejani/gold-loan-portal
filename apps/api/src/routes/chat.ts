import { ChatDecisionSchema, ChatRequestSchema, type ChatDecision, type ChatRequest } from '@goldloan/shared';
import { Router } from 'express';
import type { AgentService } from '../agent/agentService';
import { validateBody } from '../middleware/validate';

export function createChatRouter(agent: AgentService) {
  const router = Router();

  router.post('/', validateBody(ChatRequestSchema), async (req, res) => {
    const { sessionId, message } = req.body as ChatRequest;
    res.json(await agent.handleUserMessage(sessionId, message));
  });

  router.post('/confirm', validateBody(ChatDecisionSchema), async (req, res) => {
    const { sessionId, pendingId } = req.body as ChatDecision;
    const { status, body } = await agent.confirm(sessionId, pendingId);
    res.status(status).json(body);
  });

  router.post('/cancel', validateBody(ChatDecisionSchema), async (req, res) => {
    const { sessionId, pendingId } = req.body as ChatDecision;
    res.json(await agent.cancel(sessionId, pendingId));
  });

  return router;
}
