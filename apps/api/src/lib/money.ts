// ALL money maths lives here (CLAUDE.md §5). Integers only: weights in milligrams, rate in
// paise per gram, LTV in basis points. Every calculation is BigInt; there is no float
// arithmetic in this file. Each output is derived from the exact fraction with a single
// division at the end, so nothing is computed from a rounded intermediate.

export const MAX_LTV_BPS = 7500;

const KARATS = [18, 22, 24] as const;
export type Karat = (typeof KARATS)[number];

const MG_PER_GRAM = 1000n;
const BPS_DENOMINATOR = 10_000n;
const PAISE_PER_RUPEE = 100n;
const PURE_KARAT = 24n;

const DECIMAL_MAX_3DP = /^(\d+)(?:\.(\d{1,3}))?$/;

/**
 * Parses a decimal gram value into integer milligrams, string-based (no `x * 1000`).
 * Numbers are first normalised to 15 significant digits, which strips binary float
 * artefacts (0.1 + 0.2 → "0.3") without hiding genuine extra decimals (12.3456 stays 12.3456).
 * Throws RangeError for negatives, exponents, malformed input or more than 3 decimals.
 */
export function parseDecimalToMg(value: number | string): bigint {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
    text = String(Number(value.toPrecision(15)));
  } else {
    text = value.trim();
  }

  const match = DECIMAL_MAX_3DP.exec(text);
  if (!match) throw new RangeError(`Expected a non-negative decimal with at most 3 decimals, got "${text}"`);

  const [, whole, fraction = ''] = match;
  return BigInt(whole!) * MG_PER_GRAM + BigInt(fraction.padEnd(3, '0'));
}

/** Non-negative numerator / positive denominator, rounded half-up. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Formats a non-negative scaled integer as a decimal number via string (no float division). */
function scaledToNumber(value: bigint, decimals: number): number {
  const text = value.toString().padStart(decimals + 1, '0');
  return Number(`${text.slice(0, -decimals)}.${text.slice(-decimals)}`);
}

/** Plan LTV as actually applied: never above 75%. */
export function capLtvBps(maxLtvBps: number): number {
  return Math.min(maxLtvBps, MAX_LTV_BPS);
}

/** 1050 bps → 10.5 (percent), for display. */
export function bpsToPercent(bps: number): number {
  return scaledToNumber(BigInt(bps), 2);
}

/** 7500 bps → 0.75 (ratio), for display. */
export function bpsToRatio(bps: number): number {
  return scaledToNumber(BigInt(bps), 4);
}

/** 41250 mg → 41.25 (grams), for display. */
export function mgToGrams(mg: bigint): number {
  return scaledToNumber(mg, 3);
}

/** 700000 paise → 7000 (rupees), for display. */
export function paiseToRupees(paise: bigint): number {
  return scaledToNumber(paise, 2);
}

export interface QuoteInput {
  netMg: bigint;
  karat: number;
  ratePaisePerGram: bigint;
  maxLtvBps: number;
}

export interface QuoteResult {
  /** Pure gold, rounded half-up to the milligram. */
  pureGoldMg: bigint;
  /** pureGoldMg as grams (3 dp), for display. */
  pureGoldGrams: number;
  /** Gold value, rounded half-up to the paisa. */
  goldValuePaise: bigint;
  /** goldValuePaise as rupees (2 dp), for display. */
  goldValueRupees: number;
  /** min(plan max LTV, 7500). */
  appliedLtvBps: number;
  /** floor of the exact loan value, whole rupees. */
  eligibleLoanRupees: number;
}

export function calculateQuote({ netMg, karat, ratePaisePerGram, maxLtvBps }: QuoteInput): QuoteResult {
  if (netMg <= 0n) throw new RangeError('netMg must be positive');
  if (!KARATS.includes(karat as Karat)) throw new RangeError('karat must be 18, 22 or 24');
  if (ratePaisePerGram <= 0n) throw new RangeError('ratePaisePerGram must be positive');
  if (!Number.isInteger(maxLtvBps) || maxLtvBps <= 0) throw new RangeError('maxLtvBps must be a positive integer');

  const appliedLtvBps = capLtvBps(maxLtvBps);
  const k = BigInt(karat);
  const ltv = BigInt(appliedLtvBps);

  // pure mg        = netMg × karat / 24
  // value paise    = netMg × karat × ratePaise / (24 × 1000)
  // loan rupees    = netMg × karat × ratePaise × ltvBps / (24 × 1000 × 10000 × 100)
  const pureGoldMg = divRoundHalfUp(netMg * k, PURE_KARAT);
  const goldValuePaise = divRoundHalfUp(netMg * k * ratePaisePerGram, PURE_KARAT * MG_PER_GRAM);
  const eligibleLoanRupees =
    (netMg * k * ratePaisePerGram * ltv) / (PURE_KARAT * MG_PER_GRAM * BPS_DENOMINATOR * PAISE_PER_RUPEE);

  return {
    pureGoldMg,
    pureGoldGrams: mgToGrams(pureGoldMg),
    goldValuePaise,
    goldValueRupees: paiseToRupees(goldValuePaise),
    appliedLtvBps,
    eligibleLoanRupees: Number(eligibleLoanRupees),
  };
}
