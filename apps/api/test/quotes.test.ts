import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import * as schemeService from '../src/services/schemeService';
import { prisma, truncateLeads } from './helpers/db';

const app = createApp();

beforeEach(truncateLeads);

const INACTIVE_PLAN = {
  id: 'PLAN_OLD_01',
  name: 'Old Plan',
  annualRateBps: 1400,
  tenureMonths: 6,
  maxLtvBps: 6000,
  repaymentType: 'BULLET' as const,
  description: 'Retired plan',
  isActive: false,
};

async function withInactivePlan(fn: () => Promise<void>) {
  await prisma.loanScheme.create({ data: INACTIVE_PLAN });
  try {
    await fn();
  } finally {
    await prisma.loanScheme.delete({ where: { id: INACTIVE_PLAN.id } });
  }
}

describe('GET /api/v1/loan-schemes', () => {
  it('returns both seeded plans with exact values', async () => {
    const res = await request(app).get('/api/v1/loan-schemes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: 'PLAN_BULLET_01',
          name: 'Bullet Repayment',
          annualInterestRate: 12,
          tenureMonths: 12,
          maxLtv: 0.7,
          repaymentType: 'BULLET',
          description: 'Interest + principal at maturity',
        },
        {
          id: 'PLAN_EMI_01',
          name: 'Monthly EMI',
          annualInterestRate: 10.5,
          tenureMonths: 12,
          maxLtv: 0.75,
          repaymentType: 'EMI',
          description: 'Equal monthly instalments',
        },
      ],
    });
    for (const plan of res.body.data) expect(plan.maxLtv).toBeLessThanOrEqual(0.75);
  });

  it('leaves out inactive plans', async () => {
    await withInactivePlan(async () => {
      const res = await request(app).get('/api/v1/loan-schemes');
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['PLAN_BULLET_01', 'PLAN_EMI_01']);
    });
  });
});

describe('schemeService.getActiveById', () => {
  it('returns an active plan', async () => {
    expect((await schemeService.getActiveById('PLAN_EMI_01')).maxLtvBps).toBe(7500);
  });

  it.each([['PLAN_DOES_NOT_EXIST'], [INACTIVE_PLAN.id]])('throws PLAN_NOT_FOUND on planId for %s', async (id) => {
    await withInactivePlan(async () => {
      await expect(schemeService.getActiveById(id)).rejects.toMatchObject({
        status: 404,
        code: 'PLAN_NOT_FOUND',
        fields: [{ field: 'planId', message: expect.any(String) }],
      });
    });
  });
});

describe('POST /api/v1/quotes', () => {
  it('45 g net / 50 g gross / 22K → cases 1 and 2', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        input: { netWeightGrams: 45, grossWeightGrams: 50, karat: 22 },
        rate24kPerGram: 7000,
        pureGoldGrams: 41.25,
        goldValueRupees: 288750,
        goldValuePaise: 28875000,
        plans: [
          {
            planId: 'PLAN_BULLET_01',
            planName: 'Bullet Repayment',
            appliedLtv: 0.7,
            eligibleLoan: 202125,
            annualInterestRate: 12,
            tenureMonths: 12,
            repaymentType: 'BULLET',
          },
          {
            planId: 'PLAN_EMI_01',
            planName: 'Monthly EMI',
            appliedLtv: 0.75,
            eligibleLoan: 216562,
            annualInterestRate: 10.5,
            tenureMonths: 12,
            repaymentType: 'EMI',
          },
        ],
      },
    });
  });

  it('10 g net / 12 g gross / 18K → case 3', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 10, grossWeightGrams: 12, karat: 18 });
    expect(res.status).toBe(200);
    expect(res.body.data.pureGoldGrams).toBe(7.5);
    expect(res.body.data.goldValueRupees).toBe(52500);
    const emi = res.body.data.plans.find((p: { planId: string }) => p.planId === 'PLAN_EMI_01');
    expect(emi.eligibleLoan).toBe(39375);
  });

  it('net 52 > gross 50 → 400 on netWeightGrams (case 4)', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 52, grossWeightGrams: 50, karat: 22 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields[0]).toEqual({
      field: 'netWeightGrams',
      message: 'Net weight cannot be more than gross weight',
    });
  });

  it('karat 20 → 400 on karat', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([{ field: 'karat', message: 'Karat must be 18, 22 or 24' }]);
  });

  it('missing body → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/quotes');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('string weights "abc" → 400 on both weight fields', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 'abc', grossWeightGrams: 'abc', karat: 22 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual([
      'grossWeightGrams',
      'netWeightGrams',
    ]);
  });

  it('ignores client-sent money fields', async () => {
    const res = await request(app)
      .post('/api/v1/quotes')
      .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22, rate24kPerGram: 1, eligibleLoan: 99999999 });
    expect(res.status).toBe(200);
    expect(res.body.data.rate24kPerGram).toBe(7000);
    expect(res.body.data.input).toEqual({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
  });

  it('only quotes active plans', async () => {
    await withInactivePlan(async () => {
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
      expect(res.body.data.plans.map((p: { planId: string }) => p.planId)).toEqual(['PLAN_BULLET_01', 'PLAN_EMI_01']);
    });
  });

  it('does not create any Lead row', async () => {
    await request(app).post('/api/v1/quotes').send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
    await request(app).post('/api/v1/quotes').send({ netWeightGrams: 52, grossWeightGrams: 50, karat: 22 });
    expect(await prisma.lead.count()).toBe(0);
  });

  describe('gold rate', () => {
    const original = config.goldRate24kPaisePerGram;
    afterEach(() => {
      config.goldRate24kPaisePerGram = original;
    });

    it('uses the configured rate', async () => {
      config.goldRate24kPaisePerGram = '650000';
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
      expect(res.body.data.rate24kPerGram).toBe(6500);
      expect(res.body.data.goldValueRupees).toBe(268125);
    });

    it.each([['abc'], ['0'], ['-5'], ['7000.5']])('invalid configured rate %j → 503 GOLD_RATE_UNAVAILABLE', async (rate) => {
      config.goldRate24kPaisePerGram = rate;
      const res = await request(app)
        .post('/api/v1/quotes')
        .send({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 });
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: { code: 'GOLD_RATE_UNAVAILABLE', message: expect.any(String), fields: [] },
      });
    });
  });
});
