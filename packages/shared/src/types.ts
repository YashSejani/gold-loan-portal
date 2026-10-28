import type { z } from 'zod';
import type { ApplicantDetailsSchema, CHANNELS, KARATS, LeadRequestSchema, QuoteRequestSchema } from './schemas';

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
