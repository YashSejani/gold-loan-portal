import { ApplicantDetailsSchema, zodToFields, type ApplicantDetails, type Karat } from '@goldloan/shared';

export type DetailsField = 'fullName' | 'mobileNumber' | 'grossWeightGrams' | 'netWeightGrams' | 'karat';

/** What the inputs hold while typing: weights stay strings so "12." is not lost. */
export interface DetailsDraft {
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: string;
  netWeightGrams: string;
  karat: Karat | null;
}

export const EMPTY_DETAILS: DetailsDraft = {
  fullName: '',
  mobileNumber: '',
  grossWeightGrams: '',
  netWeightGrams: '',
  karat: null,
};

export type DetailsErrors = Partial<Record<DetailsField, string>>;

const DECIMAL_INPUT = /^(\d+\.?\d*|\.\d+)$/;

/** "" → missing; a well-formed decimal → number; anything else is passed through for the schema to reject. */
function weightValue(text: string): number | string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return DECIMAL_INPUT.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Validates step 1 with the SHARED schema, so the form and the API agree on every rule and message. */
export function validateDetails(draft: DetailsDraft): { data: ApplicantDetails | null; errors: DetailsErrors } {
  const result = ApplicantDetailsSchema.safeParse({
    fullName: draft.fullName,
    mobileNumber: draft.mobileNumber,
    grossWeightGrams: weightValue(draft.grossWeightGrams),
    netWeightGrams: weightValue(draft.netWeightGrams),
    karat: draft.karat ?? undefined,
  });
  if (result.success) return { data: result.data, errors: {} };

  const errors: DetailsErrors = {};
  for (const { field, message } of zodToFields(result.error)) errors[field as DetailsField] = message;
  return { data: null, errors };
}

/** Keeps only digits (mobile numbers are typed or pasted with spaces and dashes). */
export function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/\D/g, '').slice(0, maxLength);
}

/** Keeps digits and the first decimal point. */
export function decimalOnly(text: string): string {
  const [whole = '', ...rest] = text.replace(/[^\d.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}
