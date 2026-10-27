import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Seed-layer guard for CLAUDE.md §4.1: max LTV can never exceed 75% (7500 bps).
export const loanSchemeSeedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  annualRateBps: z.number().int().positive(),
  tenureMonths: z.number().int().positive(),
  maxLtvBps: z.number().int().positive().max(7500),
  repaymentType: z.enum(['BULLET', 'EMI']),
  description: z.string().min(1),
  isActive: z.boolean(),
});

export type LoanSchemeSeed = z.infer<typeof loanSchemeSeedSchema>;

export const PLANS: LoanSchemeSeed[] = [
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
];

/** Idempotent: validates every plan, then upserts by id. */
export async function seedPlans(prisma: PrismaClient, plans: LoanSchemeSeed[] = PLANS) {
  const parsed = plans.map((plan) => loanSchemeSeedSchema.parse(plan));
  for (const { id, ...data } of parsed) {
    await prisma.loanScheme.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  return parsed.length;
}
