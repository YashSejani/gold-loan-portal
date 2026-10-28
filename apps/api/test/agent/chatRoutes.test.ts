import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAgentService } from '../../src/agent/agentService';
import { createSessionStore } from '../../src/agent/sessionStore';
import { TOOL_DEFINITIONS } from '../../src/agent/tools';
import { createApp } from '../../src/app';
import { truncateLeads } from '../helpers/db';
import { APPLICANT, callTool, makeAgent, say } from './fakeLlm';

beforeEach(truncateLeads);

describe('POST /api/v1/chat, /chat/confirm, /chat/cancel', () => {
  it('chat → pending card → confirm → 201 with the created lead; no raw mobile in any response', async () => {
    const setup = makeAgent([callTool('submit_application', APPLICANT), say('Please press Confirm.'), say('All done.')]);
    const app = createApp({ agent: setup.agent });

    const chat = await request(app).post('/api/v1/chat').send({ message: 'apply for 9876543210' });
    expect(chat.status).toBe(200);
    expect(chat.body).toMatchObject({
      sessionId: expect.any(String),
      messages: [{ role: 'assistant', content: 'Please press Confirm.' }],
      pendingConfirmation: { pendingId: expect.any(String), summary: { eligibleLoan: 216562 } },
    });
    expect(chat.text).not.toContain('9876543210');

    const confirm = await request(app)
      .post('/api/v1/chat/confirm')
      .send({ sessionId: chat.body.sessionId, pendingId: chat.body.pendingConfirmation.pendingId });
    expect(confirm.status).toBe(201);
    expect(confirm.body.outcome).toMatchObject({ status: 'CREATED', lead: { applicationId: 'GL-1001', mobileNumber: '9876XXXX10' } });
    expect(confirm.text).not.toContain('9876543210');

    const again = await request(app)
      .post('/api/v1/chat/confirm')
      .send({ sessionId: chat.body.sessionId, pendingId: chat.body.pendingConfirmation.pendingId });
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { code: 'PENDING_NOT_FOUND', message: expect.any(String), fields: [] } });
  });

  it.each([
    [{ message: '' }, 'message'],
    [{ message: '   ' }, 'message'],
    [{ message: 'x'.repeat(1001) }, 'message'],
    [{ message: 'hi', sessionId: 'not-a-uuid' }, 'sessionId'],
    [{}, 'message'],
  ])('POST /chat %j → 400 on %s', async (body, field) => {
    const res = await request(createApp({ agent: makeAgent().agent })).post('/api/v1/chat').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.map((f: { field: string }) => f.field)).toContain(field);
  });

  it('accepts exactly 1000 characters', async () => {
    const res = await request(createApp({ agent: makeAgent([say('ok')]).agent }))
      .post('/api/v1/chat')
      .send({ message: 'x'.repeat(1000) });
    expect(res.status).toBe(200);
  });

  it.each(['/api/v1/chat/confirm', '/api/v1/chat/cancel'])('%s validates sessionId and pendingId', async (path) => {
    const res = await request(createApp({ agent: makeAgent().agent })).post(path).send({ sessionId: crypto.randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'pendingId', message: 'Invalid confirmation' }]);
  });

  it('without an LLM key: chat → 503 AGENT_UNAVAILABLE, everything else still works', async () => {
    const app = createApp({ agent: createAgentService({ llm: null, store: createSessionStore() }) });
    const chat = await request(app).post('/api/v1/chat').send({ message: 'hi' });
    expect(chat.status).toBe(503);
    expect(chat.body).toEqual({ error: { code: 'AGENT_UNAVAILABLE', message: expect.any(String), fields: [] } });

    const quote = await request(app).post('/api/v1/quotes').send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
    expect(quote.status).toBe(200);
  });
});

describe('tool JSON Schemas come from the shared Zod schemas', () => {
  const tool = (name: string) => TOOL_DEFINITIONS.find((t) => t.name === name)!.parameters as Record<string, any>;

  it('calculate_quote keeps karat enum and weight bounds', () => {
    const schema = tool('calculate_quote');
    expect(schema.required).toEqual(['netWeightGrams', 'grossWeightGrams', 'karat']);
    expect(schema.properties.karat.enum).toEqual([18, 22, 24]);
    expect(schema.properties.netWeightGrams).toMatchObject({ type: 'number', minimum: 0, maximum: 1000 });
    expect(JSON.stringify(schema)).not.toMatch(/\$schema|exclusiveMinimum/);
  });

  it('submit_application has the lead fields, the mobile pattern, and no channel', () => {
    const schema = tool('submit_application');
    expect(Object.keys(schema.properties).sort()).toEqual(
      ['fullName', 'grossWeightGrams', 'karat', 'mobileNumber', 'netWeightGrams', 'planId'].sort(),
    );
    expect(schema.properties.mobileNumber.pattern).toBe('^[6-9]\\d{9}$');
    expect(schema.required).not.toContain('channel');
  });

  it('exposes exactly the three §9.3 tools', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual(['get_loan_schemes', 'calculate_quote', 'submit_application']);
  });
});
