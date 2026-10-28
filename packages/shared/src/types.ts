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
