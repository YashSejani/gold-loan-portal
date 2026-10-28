import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { AppError } from '../src/lib/errors';
import * as quoteService from '../src/services/quoteService';
import { prisma, truncateLeads } from './helpers/db';

// Make quoteService.calculate stubbable for leadService (ESM exports can't be spied on directly).
vi.mock('../src/services/quoteService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/quoteService')>();
  return { ...actual, calculate: vi.fn(actual.calculate) };
});

const calculate = vi.mocked(quoteService.calculate);
const app = createApp();

const lead = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876543210',
  grossWeightGrams: 50,
  netWeightGrams: 45,
  karat: 22,
  planId: 'PLAN_EMI_01',
};

beforeEach(async () => {
  await truncateLeads();
  calculate.mockClear();
});

describe('POST /api/v1/leads when the recalculation fails', () => {
  it('GOLD_RATE_UNAVAILABLE → 503 in the error contract, no lead written', async () => {
    calculate.mockRejectedValueOnce(
      new AppError(503, 'GOLD_RATE_UNAVAILABLE', 'The gold rate is unavailable right now. Please try again later.'),
    );
    const res = await request(app).post('/api/v1/leads').send(lead);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: {
        code: 'GOLD_RATE_UNAVAILABLE',
        message: 'The gold rate is unavailable right now. Please try again later.',
        fields: [],
      },
    });
    expect(await prisma.lead.count()).toBe(0);
  });

  it('unexpected error → 500 generic message, no stack, no lead written', async () => {
    calculate.mockRejectedValueOnce(new Error('Invalid `prisma.loanScheme.findFirst()` invocation: connection refused'));
    const res = await request(app).post('/api/v1/leads').send(lead);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.', fields: [] },
    });
    expect(res.text).not.toMatch(/stack|prisma/i);
    expect(await prisma.lead.count()).toBe(0);
  });

  it('a later retry with a working rate succeeds', async () => {
    calculate.mockRejectedValueOnce(new AppError(503, 'GOLD_RATE_UNAVAILABLE', 'down'));
    expect((await request(app).post('/api/v1/leads').send(lead)).status).toBe(503);
    const retry = await request(app).post('/api/v1/leads').send(lead);
    expect(retry.status).toBe(201);
    expect(retry.body.data.eligibleLoan).toBe(216562);
  });

  it('recalculates with the chosen plan, using the same quoteService.calculate as POST /quotes', async () => {
    await request(app).post('/api/v1/leads').send(lead);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledWith(
      { netWeightGrams: 45, grossWeightGrams: 50, karat: 22 },
      { planId: 'PLAN_EMI_01' },
    );
  });
});
