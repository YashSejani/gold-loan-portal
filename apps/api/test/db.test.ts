import { beforeEach, describe, expect, it } from 'vitest';
import { PLANS, seedPlans } from '../prisma/plans';
import { prisma, truncateLeads } from './helpers/db';

const validLead = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876543210',
  grossWeightMg: 50_000,
  netWeightMg: 45_000,
  karat: 22,
  planId: 'PLAN_EMI_01',
  rate24kPaisePerGram: 700_000,
  appliedLtvBps: 7500,
  pureGoldMg: '41250',
  goldValuePaise: 28_875_000n,
  eligibleLoanRupees: 216_562,
};

beforeEach(truncateLeads);

describe('seed', () => {
  it('creates exactly the 2 active plans from CLAUDE.md §4.1', async () => {
    const plans = await prisma.loanScheme.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        annualRateBps: true,
        tenureMonths: true,
        maxLtvBps: true,
        repaymentType: true,
        description: true,
        isActive: true,
      },
    });
    expect(plans).toEqual([
      {
        id: 'PLAN_BULLET_01',
        name: 'Bullet Repayment',
        annualRateBps: 1200,
        tenureMonths: 12,
        maxLtvBps: 7000,
        repaymentType: 'BULLET',
        description: 'Interest + principal at maturity',
        isActive: true,
      },
      {
        id: 'PLAN_EMI_01',
        name: 'Monthly EMI',
        annualRateBps: 1050,
        tenureMonths: 12,
        maxLtvBps: 7500,
        repaymentType: 'EMI',
        description: 'Equal monthly instalments',
        isActive: true,
      },
    ]);
  });

  it('is idempotent: seeding again still leaves exactly 2 plans', async () => {
    await seedPlans(prisma);
    expect(await prisma.loanScheme.count()).toBe(2);
  });

  it('rejects a plan with maxLtvBps above 7500 before touching the DB', async () => {
    const bad = [{ ...PLANS[0]!, id: 'PLAN_BAD', maxLtvBps: 8000 }];
    await expect(seedPlans(prisma, bad)).rejects.toThrow();
    expect(await prisma.loanScheme.findUnique({ where: { id: 'PLAN_BAD' } })).toBeNull();
  });
});

describe('LoanScheme CHECK constraint', () => {
  it('rejects maxLtvBps 8000 at the database level', async () => {
    await expect(
      prisma.loanScheme.create({
        data: { ...PLANS[1]!, id: 'PLAN_LTV_80', maxLtvBps: 8000 },
      }),
    ).rejects.toThrow(/LoanScheme_maxLtvBps_check/);
  });
});

describe('Lead table', () => {
  it('assigns sequential application ids starting at GL-1001', async () => {
    const first = await prisma.lead.create({ data: validLead });
    const second = await prisma.lead.create({ data: { ...validLead, mobileNumber: '9876543211' } });
    expect([first.id, first.applicationId]).toEqual([1001, 'GL-1001']);
    expect([second.id, second.applicationId]).toEqual([1002, 'GL-1002']);
  });

  it.each([
    ['netWeightMg <= 0', { netWeightMg: 0 }, /Lead_netWeightMg_positive_check/],
    ['net > gross', { netWeightMg: 50_001 }, /Lead_net_le_gross_check/],
    ['gross > 1000 g', { grossWeightMg: 1_000_001 }, /Lead_grossWeightMg_max_check/],
    ['karat not 18/22/24', { karat: 20 }, /Lead_karat_check/],
  ])('rejects %s', async (_label, override, constraint) => {
    await expect(prisma.lead.create({ data: { ...validLead, ...override } })).rejects.toThrow(constraint);
  });
});
