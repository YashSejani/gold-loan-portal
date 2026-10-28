import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma, truncateLeads } from './helpers/db';

const app = createApp();

const baseLead = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876543210',
  grossWeightGrams: 50,
  netWeightGrams: 45,
  karat: 22,
  planId: 'PLAN_EMI_01',
};

const MASKED_MOBILE = /^\d{4}XXXX\d{2}$/;

function postLead(body: unknown) {
  return request(app).post('/api/v1/leads').send(body as object);
}

beforeEach(truncateLeads);

describe('POST /api/v1/leads', () => {
  it('case 1: 45 g / 22K / EMI → 201 with server numbers', async () => {
    const res = await postLead(baseLead);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      data: {
        applicationId: expect.stringMatching(/^GL-\d{4,}$/),
        status: 'SUBMITTED',
        createdAt: expect.any(String),
        fullName: 'Ravi Kumar',
        mobileNumber: '9876XXXX10',
        netWeightGrams: 45,
        grossWeightGrams: 50,
        karat: 22,
        planId: 'PLAN_EMI_01',
        planName: 'Monthly EMI',
        pureGoldGrams: 41.25,
        goldValueRupees: 288750,
        appliedLtv: 0.75,
        eligibleLoan: 216562,
      },
    });
    expect(new Date(res.body.data.createdAt).toISOString()).toBe(res.body.data.createdAt);
  });

  it('first application id is GL-1001, then GL-1002', async () => {
    const first = await postLead(baseLead);
    const second = await postLead({ ...baseLead, mobileNumber: '9876543211' });
    expect([first.body.data.applicationId, second.body.data.applicationId]).toEqual(['GL-1001', 'GL-1002']);
  });

  it('case 2: same input with PLAN_BULLET_01 → 202125', async () => {
    const res = await postLead({ ...baseLead, mobileNumber: '9123456789', planId: 'PLAN_BULLET_01' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ planId: 'PLAN_BULLET_01', appliedLtv: 0.7, eligibleLoan: 202125 });
  });

  it('case 3: 10 g / 18K / EMI → 39375', async () => {
    const res = await postLead({ ...baseLead, netWeightGrams: 10, grossWeightGrams: 12, karat: 18 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ pureGoldGrams: 7.5, goldValueRupees: 52500, eligibleLoan: 39375 });
  });

  it('case 4: net 52 > gross 50 → 400 on netWeightGrams, no lead', async () => {
    const res = await postLead({ ...baseLead, netWeightGrams: 52 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual([
      { field: 'netWeightGrams', message: 'Net weight cannot be more than gross weight' },
    ]);
    expect(await prisma.lead.count()).toBe(0);
  });

  it.each([['5876543210'], ['98765']])('case 5: mobile %s → 400 on mobileNumber', async (mobileNumber) => {
    const res = await postLead({ ...baseLead, mobileNumber });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual([
      { field: 'mobileNumber', message: 'Enter a valid 10-digit Indian mobile number starting with 6–9' },
    ]);
    expect(await prisma.lead.count()).toBe(0);
  });

  it('case 6: same mobile twice → 409 pointing at the first application', async () => {
    const first = await postLead(baseLead);
    const second = await postLead({ ...baseLead, planId: 'PLAN_BULLET_01', fullName: 'Someone Else' });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: {
        code: 'DUPLICATE_APPLICATION',
        message: 'An application from this mobile number was already submitted in the last 7 days.',
        fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
        details: {
          existingApplicationId: first.body.data.applicationId,
          existingSubmittedAt: first.body.data.createdAt,
        },
      },
    });
    expect(await prisma.lead.count()).toBe(1);
  });

  it('allows the same mobile again once the earlier lead is older than 7 days', async () => {
    const first = await postLead(baseLead);
    await prisma.lead.update({
      where: { applicationId: first.body.data.applicationId },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const second = await postLead(baseLead);
    expect(second.status).toBe(201);
    expect(await prisma.lead.count()).toBe(2);
  });

  it('still blocks a lead from 6 days 23 hours ago', async () => {
    const first = await postLead(baseLead);
    await prisma.lead.update({
      where: { applicationId: first.body.data.applicationId },
      data: { createdAt: new Date(Date.now() - (7 * 24 - 1) * 60 * 60 * 1000) },
    });
    expect((await postLead(baseLead)).status).toBe(409);
  });

  it('unknown planId → 404 PLAN_NOT_FOUND on planId, no lead', async () => {
    const res = await postLead({ ...baseLead, planId: 'PLAN_NOPE' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'PLAN_NOT_FOUND',
      fields: [{ field: 'planId', message: expect.any(String) }],
    });
    expect(await prisma.lead.count()).toBe(0);
  });

  it('deactivated plan → 404, no lead', async () => {
    await prisma.loanScheme.update({ where: { id: 'PLAN_EMI_01' }, data: { isActive: false } });
    try {
      const res = await postLead(baseLead);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PLAN_NOT_FOUND');
      expect(await prisma.lead.count()).toBe(0);
    } finally {
      await prisma.loanScheme.update({ where: { id: 'PLAN_EMI_01' }, data: { isActive: true } });
    }
  });

  it('validation runs before the plan check: bad body + bad plan → 400', async () => {
    const res = await postLead({ ...baseLead, netWeightGrams: 52, planId: 'PLAN_NOPE' });
    expect(res.status).toBe(400);
  });

  it('plan check runs before the duplicate check: duplicate mobile + bad plan → 404', async () => {
    await postLead(baseLead);
    const res = await postLead({ ...baseLead, planId: 'PLAN_NOPE' });
    expect(res.status).toBe(404);
  });

  it('server-side recalculation: client money fields are ignored (stored row and response)', async () => {
    const res = await postLead({
      ...baseLead,
      eligibleLoan: 99_999_999,
      goldValueRupees: 1,
      appliedLtv: 0.9,
      pureGoldGrams: 999,
      rate24kPerGram: 1,
      status: 'APPROVED',
      applicationId: 'GL-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'SUBMITTED',
      eligibleLoan: 216562,
      goldValueRupees: 288750,
      appliedLtv: 0.75,
      pureGoldGrams: 41.25,
    });
    expect(res.body.data.applicationId).not.toBe('GL-1');

    const row = await prisma.lead.findUniqueOrThrow({ where: { applicationId: res.body.data.applicationId } });
    expect(row).toMatchObject({
      status: 'SUBMITTED',
      channel: 'FORM',
      mobileNumber: '9876543210', // raw in DB, only for dedupe
      netWeightMg: 45_000,
      grossWeightMg: 50_000,
      rate24kPaisePerGram: 700_000,
      appliedLtvBps: 7500,
      goldValuePaise: 28_875_000n,
      eligibleLoanRupees: 216_562,
    });
    expect(row.pureGoldMg.toString()).toBe('41250');
  });

  it('stores channel AGENT when asked, with identical numbers', async () => {
    const res = await postLead({ ...baseLead, channel: 'AGENT' });
    const row = await prisma.lead.findUniqueOrThrow({ where: { applicationId: res.body.data.applicationId } });
    expect(row.channel).toBe('AGENT');
    expect(row.eligibleLoanRupees).toBe(216_562);
  });
});

describe('GET /api/v1/leads', () => {
  async function seedThree() {
    const a = await postLead({ ...baseLead, mobileNumber: '9000000001' });
    const b = await postLead({ ...baseLead, mobileNumber: '9000000002', planId: 'PLAN_BULLET_01' });
    const c = await postLead({ ...baseLead, mobileNumber: '9000000003' });
    return [a, b, c].map((r) => r.body.data.applicationId as string);
  }

  it('returns all leads newest first with masked mobiles and meta.total', async () => {
    const [a, b, c] = await seedThree();
    const res = await request(app).get('/api/v1/leads');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 3 });
    expect(res.body.data.map((l: { applicationId: string }) => l.applicationId)).toEqual([c, b, a]);
    for (const lead of res.body.data) expect(lead.mobileNumber).toMatch(MASKED_MOBILE);
    expect(res.text).not.toMatch(/900000000\d/);
  });

  it('orders by createdAt, not by id', async () => {
    const [a, b, c] = await seedThree();
    await prisma.lead.update({ where: { applicationId: c }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });
    const res = await request(app).get('/api/v1/leads');
    expect(res.body.data.map((l: { applicationId: string }) => l.applicationId)).toEqual([b, a, c]);
  });

  it('filters by planId', async () => {
    const [, b] = await seedThree();
    const res = await request(app).get('/api/v1/leads?planId=PLAN_BULLET_01');
    expect(res.body.meta).toEqual({ total: 1 });
    expect(res.body.data.map((l: { applicationId: string }) => l.applicationId)).toEqual([b]);
  });

  it('unknown planId filter → empty list', async () => {
    await seedThree();
    const res = await request(app).get('/api/v1/leads?planId=PLAN_NOPE');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], meta: { total: 0 } });
  });

  it('returns stored snapshots, not a fresh calculation', async () => {
    await postLead(baseLead);
    await prisma.lead.updateMany({ data: { eligibleLoanRupees: 123 } });
    const res = await request(app).get('/api/v1/leads');
    expect(res.body.data[0].eligibleLoan).toBe(123);
  });

  it('empty table → empty list', async () => {
    const res = await request(app).get('/api/v1/leads');
    expect(res.body).toEqual({ data: [], meta: { total: 0 } });
  });
});
