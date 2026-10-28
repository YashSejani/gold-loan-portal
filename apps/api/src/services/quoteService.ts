import type { QuoteRequest } from '@goldloan/shared';
import type { RepaymentType } from '@prisma/client';
import { InternalError, ValidationError } from '../lib/errors';
import {
  bpsToPercent,
  bpsToRatio,
  calculateQuote,
  MAX_LTV_BPS,
  paiseToRupees,
  parseDecimalToMg,
  type QuoteInput,
  type QuoteResult,
} from '../lib/money';
import { logger } from '../logger';
import { getGoldRate } from './goldRateService';
import { listActive } from './schemeService';

export interface PlanQuoteDto {
  planId: string;
  planName: string;
  appliedLtv: number;
  eligibleLoan: number;
  annualInterestRate: number;
  tenureMonths: number;
  repaymentType: RepaymentType;
}

export interface QuoteDto {
  input: QuoteRequest;
  rate24kPerGram: number;
  pureGoldGrams: number;
  goldValueRupees: number;
  goldValuePaise: number;
  plans: PlanQuoteDto[];
}

/**
 * The single quote function (CLAUDE.md §6), used by POST /quotes and, later, the agent tool
 * and lead creation. Reads plans and the rate; never writes. Throws only AppErrors.
 */
export async function calculate(input: QuoteRequest): Promise<QuoteDto> {
  const [ratePaisePerGram, plans] = await Promise.all([getGoldRate(), listActive()]);
  const netMg = toMilligrams(input.netWeightGrams);
  const quoteFor = (maxLtvBps: number) => checkedQuote({ netMg, karat: input.karat, ratePaisePerGram, maxLtvBps });

  // Pure gold and gold value do not depend on the plan.
  const base = quoteFor(MAX_LTV_BPS);

  return {
    input: { netWeightGrams: input.netWeightGrams, grossWeightGrams: input.grossWeightGrams, karat: input.karat },
    rate24kPerGram: paiseToRupees(ratePaisePerGram),
    pureGoldGrams: base.pureGoldGrams,
    goldValueRupees: base.goldValueRupees,
    goldValuePaise: Number(base.goldValuePaise),
    plans: plans.map((plan) => {
      const quote = quoteFor(plan.maxLtvBps);
      return {
        planId: plan.id,
        planName: plan.name,
        appliedLtv: bpsToRatio(quote.appliedLtvBps),
        eligibleLoan: quote.eligibleLoanRupees,
        annualInterestRate: bpsToPercent(plan.annualRateBps),
        tenureMonths: plan.tenureMonths,
        repaymentType: plan.repaymentType,
      };
    }),
  };
}

function toMilligrams(netWeightGrams: number): bigint {
  try {
    return parseDecimalToMg(netWeightGrams);
  } catch {
    // Defensive: the shared schema already rejects these.
    throw new ValidationError([{ field: 'netWeightGrams', message: 'Net weight must be more than 0 and at most 1000 g' }]);
  }
}

/** money.ts + the §6 sanity guard: a quote that breaks the 75% rule never leaves this function. */
function checkedQuote(input: QuoteInput): QuoteResult {
  let quote: QuoteResult;
  try {
    quote = calculateQuote(input);
  } catch (err) {
    if (err instanceof RangeError) throw new ValidationError([], 'The quote inputs are invalid');
    throw err;
  }

  const loan = quote.eligibleLoanRupees;
  // Exact value ≤ rounded value + 0.5 paise, so: loan × 100 × 10000 ≤ goldValuePaise × 7500 + 0.5 × 7500.
  const sane =
    Number.isSafeInteger(loan) &&
    loan >= 0 &&
    quote.appliedLtvBps <= MAX_LTV_BPS &&
    BigInt(loan) * 2_000_000n <= quote.goldValuePaise * BigInt(2 * MAX_LTV_BPS) + BigInt(MAX_LTV_BPS);

  if (!sane) {
    logger.error(
      {
        netMg: input.netMg.toString(),
        karat: input.karat,
        ratePaisePerGram: input.ratePaisePerGram.toString(),
        appliedLtvBps: quote.appliedLtvBps,
        goldValuePaise: quote.goldValuePaise.toString(),
        eligibleLoanRupees: loan,
      },
      'Quote sanity guard failed',
    );
    throw new InternalError();
  }
  return quote;
}
