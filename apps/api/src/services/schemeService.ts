import type { LoanScheme, RepaymentType } from '@prisma/client';
import { prisma } from '../db';
import { NotFoundError } from '../lib/errors';
import { bpsToPercent, bpsToRatio, capLtvBps } from '../lib/money';

export interface SchemeDto {
  id: string;
  name: string;
  annualInterestRate: number;
  tenureMonths: number;
  maxLtv: number;
  repaymentType: RepaymentType;
  description: string;
}

export function toSchemeDto(scheme: LoanScheme): SchemeDto {
  return {
    id: scheme.id,
    name: scheme.name,
    annualInterestRate: bpsToPercent(scheme.annualRateBps),
    tenureMonths: scheme.tenureMonths,
    maxLtv: bpsToRatio(capLtvBps(scheme.maxLtvBps)),
    repaymentType: scheme.repaymentType,
    description: scheme.description,
  };
}

export async function listActive(): Promise<LoanScheme[]> {
  return prisma.loanScheme.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
}

/** Throws PLAN_NOT_FOUND (on field planId) when the plan is missing or inactive. */
export async function getActiveById(id: string): Promise<LoanScheme> {
  const scheme = await prisma.loanScheme.findFirst({ where: { id, isActive: true } });
  if (!scheme) {
    throw new NotFoundError('PLAN_NOT_FOUND', 'The selected loan plan is not available.', [
      { field: 'planId', message: 'This loan plan is not available' },
    ]);
  }
  return scheme;
}
