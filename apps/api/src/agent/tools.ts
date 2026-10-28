import { randomUUID } from 'node:crypto';
import {
  formatGrams,
  formatINR,
  LeadRequestSchema,
  maskMobile,
  QuoteRequestSchema,
  zodToFields,
  type FieldError,
  type LeadRequest,
  type PendingSummaryDto,
  type QuoteDto,
} from '@goldloan/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, INTERNAL_ERROR_MESSAGE } from '../lib/errors';
import * as quoteService from '../services/quoteService';
import * as schemeService from '../services/schemeService';
import type { ToolDefinition } from './llmClient';
import { PENDING_TTL_MS, type PendingSubmission } from './sessionStore';

// ---- Tool JSON Schemas, generated from the SHARED Zod schemas (CLAUDE.md §9.3) ----

const FIELD_DESCRIPTIONS: Record<string, string> = {
  fullName: 'Full name as the user gave it: letters and single spaces, 2–60 characters.',
  mobileNumber: '10-digit Indian mobile number starting with 6–9, digits only, no +91.',
  grossWeightGrams: 'Total weight of the jewellery in grams, including stones. More than 0, at most 1000, up to 3 decimals.',
  netWeightGrams: 'Weight of the gold only in grams, excluding stones. More than 0, at most the gross weight, up to 3 decimals.',
  karat: 'Gold purity: 18, 22 or 24.',
  planId: 'The id of a plan returned by get_loan_schemes or calculate_quote, e.g. PLAN_EMI_01.',
};

type JsonObject = Record<string, unknown>;

/**
 * Zod → JSON Schema for a tool's parameters. Keeps the shared constraints (enums, bounds, patterns) and
 * drops the keywords some OpenAI-compatible providers reject ($schema, exclusiveMinimum, default).
 */
export function toToolSchema(schema: z.ZodType, omit: string[] = []): JsonObject {
  const json = z.toJSONSchema(schema, { io: 'input' }) as JsonObject;
  delete json.$schema;
  const properties = json.properties as Record<string, JsonObject>;
  for (const name of omit) delete properties[name];
  for (const [name, property] of Object.entries(properties)) {
    delete property.default;
    if ('exclusiveMinimum' in property) {
      property.minimum = property.exclusiveMinimum;
      delete property.exclusiveMinimum;
    }
    if (FIELD_DESCRIPTIONS[name]) property.description = FIELD_DESCRIPTIONS[name];
  }
  json.required = (json.required as string[]).filter((name) => !omit.includes(name));
  return json;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_loan_schemes',
    description: 'List the active gold-loan plans (name, interest rate, tenure, maximum loan-to-value, repayment type).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'calculate_quote',
    description:
      'Calculate pure gold, gold value and the eligible loan for every active plan. The only source of numbers: never compute them yourself.',
    parameters: toToolSchema(QuoteRequestSchema),
  },
  {
    name: 'submit_application',
    description:
      'Prepare an application for the user to confirm. Does NOT submit: it shows the user a summary card with a Confirm button. Call it only when every detail and the plan are known.',
    // channel is set by the server (AGENT), never by the model
    parameters: toToolSchema(LeadRequestSchema, ['channel']),
  },
];

// ---- Results returned to the model ----

export interface ToolError {
  code: string;
  message: string;
  fields: FieldError[];
}

export type ToolResult = ({ ok: true } & Record<string, unknown>) | { ok: false; error: ToolError };

export interface ToolOutcome {
  result: ToolResult;
  /** Set by submit_application: the pending item to store once the turn completes. */
  pending?: PendingSubmission;
}

export interface ToolContext {
  now: () => number;
  logger: Logger;
}

/** Runs one tool call. Never throws: every failure becomes { ok: false, error } for the model. */
export async function runTool(name: string, rawArgs: string, context: ToolContext): Promise<ToolOutcome> {
  try {
    const args = parseArguments(rawArgs);
    switch (name) {
      case 'get_loan_schemes':
        return { result: { ok: true, plans: (await schemeService.listActive()).map(schemeService.toSchemeDto) } };
      case 'calculate_quote':
        return { result: await calculateQuote(args) };
      case 'submit_application':
        return await submitApplication(args, context.now);
      default:
        return {
          result: {
            ok: false,
            error: { code: 'UNKNOWN_TOOL', message: `There is no tool called "${name}".`, fields: [] },
          },
        };
    }
  } catch (err) {
    return { result: { ok: false, error: toToolError(err, context.logger) } };
  }
}

/** AppErrors keep their (user-safe) message; anything else becomes the generic message, details logged only. */
export function toToolError(err: unknown, logger: Logger): ToolError {
  if (err instanceof AppError) return { code: err.code, message: err.message, fields: err.fields };
  logger.error({ err }, 'Agent tool failed');
  return { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE, fields: [] };
}

function parseArguments(rawArgs: string): unknown {
  if (rawArgs.trim() === '') return {};
  try {
    return JSON.parse(rawArgs);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Tool arguments must be a JSON object.');
  }
}

function invalid(error: z.ZodError): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Some details are invalid.', zodToFields(error));
}

async function calculateQuote(args: unknown): Promise<ToolResult> {
  const parsed = QuoteRequestSchema.safeParse(args);
  if (!parsed.success) throw invalid(parsed.error);
  // The same function as POST /quotes.
  const quote = quoteService.toQuoteDto(await quoteService.calculate(parsed.data));
  return { ok: true, quote: withDisplayText(quote) };
}

/** Pre-formatted amounts the model can copy verbatim, so it never formats (or alters) numbers itself. */
function withDisplayText(quote: QuoteDto) {
  return {
    ...quote,
    rateDisplay: `${formatINR(quote.rate24kPerGram)}/g (24K)`,
    pureGoldDisplay: formatGrams(quote.pureGoldGrams),
    goldValueDisplay: formatINR(quote.goldValueRupees),
    plans: quote.plans.map((plan) => ({ ...plan, eligibleLoanDisplay: formatINR(plan.eligibleLoan) })),
  };
}

async function submitApplication(args: unknown, now: () => number): Promise<ToolOutcome> {
  const parsed = LeadRequestSchema.safeParse(args);
  if (!parsed.success) throw invalid(parsed.error);
  const payload: LeadRequest = { ...parsed.data, channel: 'AGENT' };

  await schemeService.getActiveById(payload.planId); // 404 PLAN_NOT_FOUND if missing or inactive
  const pending = await preparePending(payload, now);

  // No database write here: the lead is created only by /chat/confirm.
  return {
    pending,
    result: {
      ok: true,
      status: 'PENDING_USER_CONFIRMATION',
      summary: {
        ...pending.summary,
        eligibleLoanDisplay: formatINR(pending.summary.eligibleLoan),
        goldValueDisplay: formatINR(pending.summary.goldValueRupees),
      },
      note: 'Nothing has been submitted yet. The user must press Confirm on the summary card.',
    },
  };
}

/** Quotes the chosen plan now (same quoteService as everything else) and builds a single-use pending item. */
export async function preparePending(payload: LeadRequest, now: () => number): Promise<PendingSubmission> {
  const quote = await quoteService.calculate(
    { netWeightGrams: payload.netWeightGrams, grossWeightGrams: payload.grossWeightGrams, karat: payload.karat },
    { planId: payload.planId },
  );
  const planQuote = quote.plans[0];
  const dto = quoteService.toQuoteDto(quote);
  const plan = dto.plans[0];
  if (!planQuote || !plan) throw new AppError(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);

  const expiresAt = now() + PENDING_TTL_MS;
  const summary: PendingSummaryDto = {
    fullName: payload.fullName,
    mobileNumber: maskMobile(payload.mobileNumber),
    grossWeightGrams: payload.grossWeightGrams,
    netWeightGrams: payload.netWeightGrams,
    karat: payload.karat,
    planId: plan.planId,
    planName: plan.planName,
    repaymentType: plan.repaymentType,
    annualInterestRate: plan.annualInterestRate,
    tenureMonths: plan.tenureMonths,
    rate24kPerGram: dto.rate24kPerGram,
    pureGoldGrams: dto.pureGoldGrams,
    goldValueRupees: dto.goldValueRupees,
    appliedLtv: plan.appliedLtv,
    eligibleLoan: plan.eligibleLoan,
    expiresAt: new Date(expiresAt).toISOString(),
  };
  return {
    pendingId: randomUUID(),
    payload,
    quoted: {
      ratePaisePerGram: quote.ratePaisePerGram,
      appliedLtvBps: planQuote.appliedLtvBps,
      eligibleLoanRupees: planQuote.eligibleLoanRupees,
    },
    summary,
    expiresAt,
    locked: false,
  };
}
