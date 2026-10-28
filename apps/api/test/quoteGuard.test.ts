import { describe, expect, it, vi } from 'vitest';

// Force money.ts to return an impossible loan, to prove the §6 sanity guard fires.
vi.mock('../src/lib/money', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/money')>();
  return {
    ...actual,
    calculateQuote: (input: Parameters<typeof actual.calculateQuote>[0]) => ({
      ...actual.calculateQuote(input),
      eligibleLoanRupees: 999_999_999,
    }),
  };
});

const { calculate } = await import('../src/services/quoteService');

describe('quoteService sanity guard', () => {
  it('throws INTERNAL_ERROR when the loan exceeds 75% of the gold value', async () => {
    await expect(calculate({ netWeightGrams: 45, grossWeightGrams: 50, karat: 22 })).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
