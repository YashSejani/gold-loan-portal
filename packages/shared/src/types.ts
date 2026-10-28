import type { z } from 'zod';
import type {
  ApplicantDetailsSchema,
  CHANNELS,
  ChatDecisionSchema,
  ChatRequestSchema,
  KARATS,
  LeadRequestSchema,
  QuoteRequestSchema,
} from './schemas';

export type Karat = (typeof KARATS)[number];
export type Channel = (typeof CHANNELS)[number];

/** Validated (output) shapes, after trimming, coercion and defaults. */
export type QuoteRequest = z.output<typeof QuoteRequestSchema>;
export type LeadRequest = z.output<typeof LeadRequestSchema>;
export type ApplicantDetails = z.output<typeof ApplicantDetailsSchema>;

/** What a client may send before validation (e.g. karat as "22", channel omitted). */
export type QuoteRequestInput = z.input<typeof QuoteRequestSchema>;
export type LeadRequestInput = z.input<typeof LeadRequestSchema>;

/** One entry of the error contract's `fields[]`. */
export interface FieldError {
  field: string;
  message: string;
}

// ---- Response DTOs (CLAUDE.md §6): the one contract the API returns and the web reads ----

export type RepaymentType = 'BULLET' | 'EMI';
export type LeadStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface SchemeDto {
  id: string;
  name: string;
  annualInterestRate: number;
  tenureMonths: number;
  maxLtv: number;
  repaymentType: RepaymentType;
  description: string;
}

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

export interface LeadDto {
  applicationId: string;
  status: LeadStatus;
  createdAt: string;
  fullName: string;
  /** Always masked, e.g. 9876XXXX10. */
  mobileNumber: string;
  netWeightGrams: number;
  grossWeightGrams: number;
  karat: number;
  planId: string;
  planName: string;
  pureGoldGrams: number;
  goldValueRupees: number;
  appliedLtv: number;
  eligibleLoan: number;
}

// ---- Loan Assist chat ----

export type ChatRequest = z.output<typeof ChatRequestSchema>;
export type ChatDecision = z.output<typeof ChatDecisionSchema>;

/** What the user confirms in the UI card. Every number comes from the server quote. */
export interface PendingSummaryDto {
  fullName: string;
  /** Masked, e.g. 9876XXXX10. */
  mobileNumber: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  planId: string;
  planName: string;
  repaymentType: RepaymentType;
  annualInterestRate: number;
  tenureMonths: number;
  rate24kPerGram: number;
  pureGoldGrams: number;
  goldValueRupees: number;
  appliedLtv: number;
  eligibleLoan: number;
  expiresAt: string;
}

export interface PendingConfirmationDto {
  pendingId: string;
  summary: PendingSummaryDto;
}

export interface ToolEventDto {
  tool: string;
  status: 'ok' | 'error';
  result?: unknown;
}

export interface ChatErrorDto {
  code: string;
  message: string;
  fields: FieldError[];
  details?: Record<string, unknown>;
}

export type ChatOutcomeDto =
  | { status: 'CREATED'; lead: LeadDto }
  | { status: 'FAILED'; error: ChatErrorDto }
  | { status: 'CANCELLED' };

export interface ChatResponseDto {
  sessionId: string;
  messages: Array<{ role: 'assistant'; content: string }>;
  toolEvents: ToolEventDto[];
  pendingConfirmation?: PendingConfirmationDto;
  /** Set by /chat/confirm and /chat/cancel. */
  outcome?: ChatOutcomeDto;
}
