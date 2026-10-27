import { describe, expect, it } from 'vitest';
import { calculateQuote, parseDecimalToMg } from '../src/lib/money';

const RATE = 700_000n; // ₹7,000/g in paise

describe('parseDecimalToMg', () => {
  it.each([
    ['45', 45_000n],
    [45, 45_000n],
    [10.5, 10_500n],
    ['10.5', 10_500n],
    [12.345, 12_345n],
    ['12.345', 12_345n],
    ['0.001', 1n],
    [0.001, 1n],
    ['45.500', 45_500n],
    [1000, 1_000_000n],
  ])('%j → %s mg', (input, expected) => {
    expect(parseDecimalToMg(input)).toBe(expected);
  });

  it('handles float artefacts like 0.1 + 0.2 without a float multiply', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the trap is real
    expect(parseDecimalToMg(0.1 + 0.2)).toBe(300n);
    expect(parseDecimalToMg(1.1 + 2.2)).toBe(3_300n);
    // Math.floor(1.001 * 1000) === 1000: naive scaling loses a milligram
    expect(Math.floor(1.001 * 1000)).toBe(1000);
    expect(parseDecimalToMg(1.001)).toBe(1_001n);
  });

  it.each([['12.3456'], [12.3456], ['0.0001'], [0.0005]])('rejects more than 3 decimals: %j', (input) => {
    expect(() => parseDecimalToMg(input)).toThrow(RangeError);
  });

  it.each([['abc'], [''], ['-1'], [-1], ['1e3'], ['.5'], ['5.'], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects malformed input: %j',
    (input) => {
      expect(() => parseDecimalToMg(input)).toThrow(RangeError);
    },
  );
});

describe('calculateQuote: CLAUDE.md §5 test vectors', () => {
  it.each([
    // net g,   karat, maxLtvBps, pure g,  gold value ₹, gold value paise, loan ₹
    ['45', 22, 7500, 41.25, 288_750, 28_875_000n, 216_562], // case 1
    ['45', 22, 7000, 41.25, 288_750, 28_875_000n, 202_125], // case 2
    ['10', 18, 7500, 7.5, 52_500, 5_250_000n, 39_375], // case 3
    ['1', 18, 7000, 0.75, 5_250, 525_000n, 3_675], // float trap
    ['1', 18, 7500, 0.75, 5_250, 525_000n, 3_937],
    ['10.5', 22, 7500, 9.625, 67_375, 6_737_500n, 50_531],
    ['10.5', 22, 7000, 9.625, 67_375, 6_737_500n, 47_162],
    ['12.345', 22, 7500, 11.316, 79_213.75, 7_921_375n, 59_410],
    ['0.001', 24, 7500, 0.001, 7, 700n, 5],
    ['1000', 24, 7500, 1000, 7_000_000, 700_000_000n, 5_250_000],
    ['45', 22, 8000, 41.25, 288_750, 28_875_000n, 216_562], // plan says 80% → capped 75%
  ] as const)(
    '%s g %iK @ %i bps → pure %s g, value ₹%s, loan ₹%s',
    (net, karat, maxLtvBps, pureGoldGrams, goldValueRupees, goldValuePaise, eligibleLoanRupees) => {
      const quote = calculateQuote({
        netMg: parseDecimalToMg(net),
        karat,
        ratePaisePerGram: RATE,
        maxLtvBps,
      });
      expect(quote.pureGoldGrams).toBe(pureGoldGrams);
      expect(quote.goldValueRupees).toBe(goldValueRupees);
      expect(quote.goldValuePaise).toBe(goldValuePaise);
      expect(quote.appliedLtvBps).toBe(Math.min(maxLtvBps, 7500));
      expect(quote.eligibleLoanRupees).toBe(eligibleLoanRupees);
    },
  );

  it('naive float maths gets the 1 g / 18K / 70% case wrong (3674), money.ts gets 3675', () => {
    expect(Math.floor(1 * (18 / 24) * 7000 * 0.7)).toBe(3674);
    const quote = calculateQuote({ netMg: 1_000n, karat: 18, ratePaisePerGram: RATE, maxLtvBps: 7000 });
    expect(quote.eligibleLoanRupees).toBe(3675);
  });

  it('rounds pure gold half-up to the milligram', () => {
    // 1 mg × 22/24 = 0.9166… mg → 1 mg
    expect(calculateQuote({ netMg: 1n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 7500 }).pureGoldMg).toBe(1n);
    // 2 mg × 18/24 = 1.5 mg (exact tie) → 2 mg
    expect(calculateQuote({ netMg: 2n, karat: 18, ratePaisePerGram: RATE, maxLtvBps: 7500 }).pureGoldMg).toBe(2n);
    // 1 mg × 18/24 = 0.75 mg → 1 mg; display 0.001 g
    const q = calculateQuote({ netMg: 1n, karat: 18, ratePaisePerGram: RATE, maxLtvBps: 7500 });
    expect([q.pureGoldMg, q.pureGoldGrams]).toEqual([1n, 0.001]);
  });

  it('rounds gold value half-up to the paisa', () => {
    // 1 mg × 22 × 700000 / 24000 = 641.66… paise → 642 (₹6.42)
    const q = calculateQuote({ netMg: 1n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 7500 });
    expect([q.goldValuePaise, q.goldValueRupees]).toEqual([642n, 6.42]);
    // 1 mg × 24 × 500 / 24000 = 0.5 paise (exact tie) → 1
    expect(calculateQuote({ netMg: 1n, karat: 24, ratePaisePerGram: 500n, maxLtvBps: 7500 }).goldValuePaise).toBe(1n);
  });

  it('computes the loan from the exact value, never from the rounded gold value', () => {
    // 1 mg × 24K × 399600 paise/g = 399.6 paise exact → rounds to 400 paise.
    // Exact: 399.6 × 0.75 / 100 = ₹2.997 → 2.  From rounded: 400 × 0.75 / 100 = ₹3 (wrong).
    const q = calculateQuote({ netMg: 1n, karat: 24, ratePaisePerGram: 399_600n, maxLtvBps: 7500 });
    expect(q.goldValuePaise).toBe(400n);
    expect(q.eligibleLoanRupees).toBe(2);
  });

  it.each([
    [{ netMg: 0n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 7500 }],
    [{ netMg: -1n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 7500 }],
    [{ netMg: 1000n, karat: 20, ratePaisePerGram: RATE, maxLtvBps: 7500 }],
    [{ netMg: 1000n, karat: 22, ratePaisePerGram: 0n, maxLtvBps: 7500 }],
    [{ netMg: 1000n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 0 }],
    [{ netMg: 1000n, karat: 22, ratePaisePerGram: RATE, maxLtvBps: 70.5 }],
  ])('rejects invalid input %#', (input) => {
    expect(() => calculateQuote(input)).toThrow(RangeError);
  });
});

describe('calculateQuote: property test against an independent BigInt reference', () => {
  // Reference works in half-grams and whole rupees per gram (a different unit system from money.ts),
  // and rounds via quotient/remainder instead of the (2n + d) / 2d trick.
  function reference(halfGrams: bigint, karat: bigint, ltvBps: bigint) {
    const ratePerGramRupees = 7_000n;
    // loan ₹ = (halfGrams / 2) × (karat / 24) × rate × (ltvBps / 10000)
    const loanNum = halfGrams * karat * ratePerGramRupees * ltvBps;
    const loanDen = 2n * 24n * 10_000n;
    // value paise = (halfGrams / 2) × (karat / 24) × rate × 100
    const valueNum = halfGrams * karat * ratePerGramRupees * 100n;
    const valueDen = 2n * 24n;
    const valueQ = valueNum / valueDen;
    const valueR = valueNum % valueDen;
    return {
      eligibleLoanRupees: Number(loanNum / loanDen),
      goldValuePaise: valueR * 2n >= valueDen ? valueQ + 1n : valueQ,
    };
  }

  it('matches for net 0.5 … 200 g step 0.5, karat 18/22/24, LTV 70/75%', () => {
    let checked = 0;
    for (let halfGrams = 1n; halfGrams <= 400n; halfGrams++) {
      const net = Number(halfGrams) / 2; // e.g. 0.5, 1, 1.5 … exactly representable
      for (const karat of [18, 22, 24] as const) {
        for (const ltvBps of [7000, 7500] as const) {
          const quote = calculateQuote({
            netMg: parseDecimalToMg(net),
            karat,
            ratePaisePerGram: RATE,
            maxLtvBps: ltvBps,
          });
          const ref = reference(halfGrams, BigInt(karat), BigInt(ltvBps));
          expect(quote.eligibleLoanRupees, `${net} g ${karat}K ${ltvBps}`).toBe(ref.eligibleLoanRupees);
          expect(quote.goldValuePaise, `${net} g ${karat}K ${ltvBps}`).toBe(ref.goldValuePaise);
          checked++;
        }
      }
    }
    expect(checked).toBe(400 * 3 * 2);
  });
});
