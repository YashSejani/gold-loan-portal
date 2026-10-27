import { Writable } from 'node:stream';
import { QuoteRequestSchema } from '@goldloan/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app';
import { ConflictError } from '../src/lib/errors';
import { createLogger } from '../src/logger';
import { validateBody } from '../src/middleware/validate';

const INTERNAL_SECRET = 'PrismaClientKnownRequestError: connection to postgres://goldloan:goldloan@db failed';

function testRoutes() {
  const router = Router();
  router.get('/__test/async-throw', async () => {
    await Promise.resolve();
    throw new Error(INTERNAL_SECRET);
  });
  router.get('/__test/throw-with-mobile', async () => {
    throw new Error('lookup failed for 9876543210');
  });
  router.get('/__test/conflict', () => {
    throw new ConflictError(
      'DUPLICATE_APPLICATION',
      'An application from this mobile number was already submitted in the last 7 days.',
      [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
      { existingApplicationId: 'GL-1042' },
    );
  });
  router.get('/__test/zod-throw', () => {
    z.object({ karat: z.number() }).parse({ karat: 'x' });
  });
  router.post('/__test/quote-echo', validateBody(QuoteRequestSchema), (req, res) => {
    res.json({ data: req.body });
  });
  return router;
}

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, logger: createLogger({ level: 'info', destination: stream }) };
}

const app = createApp({ extraRoutes: testRoutes() });

describe('error contract', () => {
  it('unknown route → 404 ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String), fields: [] },
    });
  });

  it('unknown route outside /api/v1 → same 404 shape', async () => {
    const res = await request(app).post('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/__test/quote-echo')
      .set('Content-Type', 'application/json')
      .send('{"netWeightGrams": 45,');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_JSON', message: expect.any(String), fields: [] },
    });
  });

  it('body over 100kb → 413 PAYLOAD_TOO_LARGE in the same shape', async () => {
    const res = await request(app)
      .post('/api/v1/__test/quote-echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String), fields: [] },
    });
  });

  it('validateBody → 400 VALIDATION_ERROR with fields[] from the shared schema', async () => {
    const res = await request(app)
      .post('/api/v1/__test/quote-echo')
      .send({ netWeightGrams: 52, grossWeightGrams: 50, karat: 22 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        fields: [{ field: 'netWeightGrams', message: 'Net weight cannot be more than gross weight' }],
      },
    });
  });

  it('validateBody replaces req.body with the parsed data (unknown keys stripped, karat coerced)', async () => {
    const res = await request(app)
      .post('/api/v1/__test/quote-echo')
      .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: '22', eligibleLoan: 99_999_999 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { netWeightGrams: 45, grossWeightGrams: 50, karat: 22 } });
  });

  it('missing JSON body → 400 VALIDATION_ERROR on "body"', async () => {
    const res = await request(app).post('/api/v1/__test/quote-echo');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual([{ field: 'body', message: expect.any(String) }]);
  });

  it('a raw ZodError thrown in a handler → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/v1/__test/zod-throw');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual([{ field: 'karat', message: expect.any(String) }]);
  });

  it('async throw → 500 INTERNAL_ERROR, generic message, no stack, no internals', async () => {
    const res = await request(app).get('/api/v1/__test/async-throw');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', fields: [] },
    });
    expect(res.text).not.toMatch(/stack/i);
    expect(res.text).not.toContain('Prisma');
    expect(res.text).not.toContain('postgres://');
  });

  it('ConflictError → 409 with fields[] and details', async () => {
    const res = await request(app).get('/api/v1/__test/conflict');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'DUPLICATE_APPLICATION',
        message: 'An application from this mobile number was already submitted in the last 7 days.',
        fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
        details: { existingApplicationId: 'GL-1042' },
      },
    });
  });
});

describe('app middleware', () => {
  it('sets a request id, and echoes a sane incoming one', async () => {
    const generated = await request(app).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await request(app).get('/api/v1/health').set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
  });

  it('sends helmet security headers and the CORS origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('logging', () => {
  it('logs the real 500 error server-side, with mobiles masked', async () => {
    const { lines, logger } = captureLogs();
    const res = await request(createApp({ logger, extraRoutes: testRoutes() })).get(
      '/api/v1/__test/throw-with-mobile',
    );
    expect(res.status).toBe(500);
    const output = lines.join('');
    expect(output).toContain('lookup failed for 9876XXXX10');
    expect(output).not.toContain('9876543210');
  });

  it('masks mobileNumber fields and mobiles in URLs and free text', () => {
    const { lines, logger } = captureLogs();
    logger.info({ mobileNumber: '9123456789', lead: { mobileNumber: '9876543210' } }, 'user said 8765432109');
    logger.info({ url: '/api/v1/leads?mobile=7654321098' }, 'request');
    const output = lines.join('');
    expect(output).toContain('9123XXXX89');
    expect(output).toContain('9876XXXX10');
    expect(output).toContain('8765XXXX09');
    expect(output).toContain('7654XXXX98');
    expect(output).not.toMatch(/9123456789|9876543210|8765432109|7654321098/);
  });
});
