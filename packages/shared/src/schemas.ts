import { z } from 'zod';
import type { FieldError } from './types';

// Shared by the API, the agent tools and the web form (CLAUDE.md §4.3).
export const MESSAGES = {
  fullName: 'Name must be 2–60 characters, letters and spaces only',
  mobileNumber: 'Enter a valid 10-digit Indian mobile number starting with 6–9',
  grossWeight: 'Gross weight must be more than 0 and at most 1000 g',
  netWeight: 'Net weight must be more than 0 and at most 1000 g',
  weightDecimals: 'Weight can have at most 3 decimal places',
  netGreaterThanGross: 'Net weight cannot be more than gross weight',
  karat: 'Karat must be 18, 22 or 24',
  planId: 'Choose a loan plan',
  channel: 'Channel must be FORM or AGENT',
  body: 'Request body must be a JSON object',
} as const;

export const KARATS = [18, 22, 24] as const;
export const CHANNELS = ['FORM', 'AGENT'] as const;
export const MAX_WEIGHT_GRAMS = 1000;

const NAME_PATTERN = /^[A-Za-z]+( [A-Za-z]+)*$/;
const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const DECIMAL_MAX_3DP = /^(\d+)(?:\.(\d{1,3}))?$/;

/**
 * Integer milligrams for a gram value with at most 3 decimals, or null.
 * Works on the decimal string (15 significant digits strips float artefacts like 0.1 + 0.2),
 * so there is no float multiplication. Same normalisation as apps/api/src/lib/money.ts.
 */
function toMilligrams(grams: unknown): number | null {
  if (typeof grams !== 'number' || !Number.isFinite(grams)) return null;
  const match = DECIMAL_MAX_3DP.exec(String(Number(grams.toPrecision(15))));
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

function isValidWeightMg(mg: number | null): mg is number {
  return mg !== null && mg > 0 && mg <= MAX_WEIGHT_GRAMS * 1000;
}

function weightSchema(rangeMessage: string) {
  return z
    .number({ error: rangeMessage })
    .gt(0, { error: rangeMessage })
    .lte(MAX_WEIGHT_GRAMS, { error: rangeMessage })
    .refine((grams) => toMilligrams(grams) !== null, { error: MESSAGES.weightDecimals });
}

const fullName = z
  .string({ error: MESSAGES.fullName })
  .trim()
  .min(2, { error: MESSAGES.fullName })
  .max(60, { error: MESSAGES.fullName })
  .regex(NAME_PATTERN, { error: MESSAGES.fullName });

const mobileNumber = z.string({ error: MESSAGES.mobileNumber }).regex(MOBILE_PATTERN, { error: MESSAGES.mobileNumber });

const grossWeightGrams = weightSchema(MESSAGES.grossWeight);
const netWeightGrams = weightSchema(MESSAGES.netWeight);

// Forms send "22"; coerce only plain digit strings (z.coerce would turn "" into 0 and true into 1).
const karat = z.preprocess(
  (value) => (typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value),
  z.literal(KARATS, { error: MESSAGES.karat }),
);

const planId = z.string({ error: MESSAGES.planId }).trim().min(1, { error: MESSAGES.planId });

const channel = z.enum(CHANNELS, { error: MESSAGES.channel }).default('FORM');

// Data may be partly invalid here (see crossFieldCheck): only compare two individually valid weights.
function netNotAboveGross(data: { netWeightGrams: unknown; grossWeightGrams: unknown }, ctx: z.RefinementCtx) {
  const netMg = toMilligrams(data.netWeightGrams);
  const grossMg = toMilligrams(data.grossWeightGrams);
  if (!isValidWeightMg(netMg) || !isValidWeightMg(grossMg)) return;
  if (netMg > grossMg) {
    ctx.addIssue({ code: 'custom', path: ['netWeightGrams'], message: MESSAGES.netGreaterThanGross });
  }
}

// By default Zod v4 skips object refinements when another field has a type error (e.g. name still empty),
// which would hide "net > gross" until the whole form is filled. Run it for any object input instead.
const crossFieldCheck = {
  when: (payload: { value: unknown }) => typeof payload.value === 'object' && payload.value !== null,
};

// z.object strips unknown keys, so client-sent money fields (eligibleLoan, goldValue, …) never get through.
export const QuoteRequestSchema = z
  .object({ netWeightGrams, grossWeightGrams, karat }, { error: MESSAGES.body })
  .superRefine(netNotAboveGross, crossFieldCheck);

const applicantDetailsShape = { fullName, mobileNumber, grossWeightGrams, netWeightGrams, karat };

/** Step 1 of the web form: the lead without planId/channel (Zod v4 can't .pick() a refined object). */
export const ApplicantDetailsSchema = z
  .object(applicantDetailsShape, { error: MESSAGES.body })
  .superRefine(netNotAboveGross, crossFieldCheck);

export const LeadRequestSchema = z
  .object({ ...applicantDetailsShape, planId, channel }, { error: MESSAGES.body })
  .superRefine(netNotAboveGross, crossFieldCheck);

/** Flattens a ZodError into the API `fields[]` shape: one entry per field, first issue wins. */
export function zodToFields(error: z.ZodError): FieldError[] {
  const fields = new Map<string, string>();
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'body';
    if (!fields.has(field)) fields.set(field, issue.message);
  }
  return [...fields].map(([field, message]) => ({ field, message }));
}
