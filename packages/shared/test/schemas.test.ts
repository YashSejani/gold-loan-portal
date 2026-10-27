import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { LeadRequestSchema, MESSAGES, QuoteRequestSchema, zodToFields } from '../src/schemas';

const validQuote = { netWeightGrams: 45, grossWeightGrams: 50, karat: 22 };
const validLead = {
  fullName: 'Ravi Kumar',
  mobileNumber: '9876543210',
  grossWeightGrams: 50,
  netWeightGrams: 45,
  karat: 22,
  planId: 'PLAN_EMI_01',
};

function fieldsOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? [] : zodToFields(result.error);
}

describe('QuoteRequestSchema', () => {
  it('accepts a valid quote request', () => {
    expect(QuoteRequestSchema.parse(validQuote)).toEqual(validQuote);
  });

  it('net 52 > gross 50 → exactly one field error on netWeightGrams (test case 4)', () => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 52, grossWeightGrams: 50 })).toEqual([
      { field: 'netWeightGrams', message: MESSAGES.netGreaterThanGross },
    ]);
  });

  it('accepts net == gross', () => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 50 })).toEqual([]);
  });

  it('compares net and gross without float error (0.1 + 0.2 vs 0.3)', () => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 0.1 + 0.2, grossWeightGrams: 0.3 })).toEqual(
      [],
    );
  });

  it.each([[1000], [0.001], [12.345], [0.1 + 0.2], [45]])('accepts gross weight %s', (gross) => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 0.001, grossWeightGrams: gross })).toEqual(
      [],
    );
  });

  it.each([
    [0, MESSAGES.grossWeight],
    [-1, MESSAGES.grossWeight],
    [1000.0001, MESSAGES.grossWeight],
    [1001, MESSAGES.grossWeight],
    [1.2345, MESSAGES.weightDecimals],
    ['50', MESSAGES.grossWeight],
    [Number.NaN, MESSAGES.grossWeight],
    [Number.POSITIVE_INFINITY, MESSAGES.grossWeight],
  ])('rejects gross weight %s', (gross, message) => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 0.001, grossWeightGrams: gross })).toEqual([
      { field: 'grossWeightGrams', message },
    ]);
  });

  it.each([
    [0, MESSAGES.netWeight],
    [-1, MESSAGES.netWeight],
    [1.2345, MESSAGES.weightDecimals],
    [undefined, MESSAGES.netWeight],
  ])('rejects net weight %s', (net, message) => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: net, grossWeightGrams: 1000 })).toEqual([
      { field: 'netWeightGrams', message },
    ]);
  });

  it.each([[18], [22], [24]])('accepts karat %s', (karat) => {
    expect(QuoteRequestSchema.parse({ ...validQuote, karat }).karat).toBe(karat);
  });

  it('coerces a numeric karat string from a form ("22" → 22)', () => {
    expect(QuoteRequestSchema.parse({ ...validQuote, karat: '22' }).karat).toBe(22);
    expect(QuoteRequestSchema.parse({ ...validQuote, karat: ' 18 ' }).karat).toBe(18);
  });

  it.each([[20], [23], [22.5], ['22.5'], ['abc'], [''], [true], [null]])('rejects karat %j', (karat) => {
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, karat })).toEqual([
      { field: 'karat', message: MESSAGES.karat },
    ]);
  });
});

describe('LeadRequestSchema', () => {
  it('accepts a valid lead and defaults channel to FORM', () => {
    expect(LeadRequestSchema.parse(validLead)).toEqual({ ...validLead, channel: 'FORM' });
  });

  it('accepts channel AGENT and rejects anything else', () => {
    expect(LeadRequestSchema.parse({ ...validLead, channel: 'AGENT' }).channel).toBe('AGENT');
    expect(fieldsOf(LeadRequestSchema, { ...validLead, channel: 'WEB' }).map((f) => f.field)).toEqual(['channel']);
  });

  it('strips client money fields and unknown keys', () => {
    const parsed = LeadRequestSchema.parse({
      ...validLead,
      eligibleLoan: 99_999_999,
      goldValue: 1,
      goldValueRupees: 1,
      pureGoldGrams: 1,
      appliedLtv: 0.9,
      rate24kPerGram: 1,
      maxLtv: 0.9,
      status: 'APPROVED',
      applicationId: 'GL-1',
      hacker: true,
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ['channel', 'fullName', 'grossWeightGrams', 'karat', 'mobileNumber', 'netWeightGrams', 'planId'].sort(),
    );
  });

  it('applies the net <= gross rule', () => {
    expect(fieldsOf(LeadRequestSchema, { ...validLead, netWeightGrams: 52 })).toEqual([
      { field: 'netWeightGrams', message: MESSAGES.netGreaterThanGross },
    ]);
  });

  describe('fullName', () => {
    it.each([['Ravi Kumar'], ['Ra'], ['A'.repeat(60)], ['Ravi Kumar Sharma']])('accepts %j', (fullName) => {
      expect(fieldsOf(LeadRequestSchema, { ...validLead, fullName })).toEqual([]);
    });

    it('trims surrounding spaces', () => {
      expect(LeadRequestSchema.parse({ ...validLead, fullName: '  Ravi Kumar ' }).fullName).toBe('Ravi Kumar');
    });

    it.each([['A'], ['A'.repeat(61)], ['Ravi123'], ['Ravi  Kumar'], ['Ravi-Kumar'], [''], ['   '], [42]])(
      'rejects %j',
      (fullName) => {
        expect(fieldsOf(LeadRequestSchema, { ...validLead, fullName })).toEqual([
          { field: 'fullName', message: MESSAGES.fullName },
        ]);
      },
    );
  });

  describe('mobileNumber', () => {
    it.each([['9876543210'], ['6000000000'], ['7123456789'], ['8123456789']])('accepts %j', (mobileNumber) => {
      expect(fieldsOf(LeadRequestSchema, { ...validLead, mobileNumber })).toEqual([]);
    });

    it.each([
      ['5876543210'], // test case 5: starts with 5
      ['98765'], // test case 5: too short
      [9876543210], // number, not string
      ['+919876543210'],
      ['98765 43210'],
      ['98765432101'],
      [''],
    ])('rejects %j (test case 5)', (mobileNumber) => {
      expect(fieldsOf(LeadRequestSchema, { ...validLead, mobileNumber })).toEqual([
        { field: 'mobileNumber', message: MESSAGES.mobileNumber },
      ]);
    });
  });

  describe('planId', () => {
    it.each([[''], ['  '], [undefined]])('rejects %j', (planId) => {
      expect(fieldsOf(LeadRequestSchema, { ...validLead, planId })).toEqual([
        { field: 'planId', message: MESSAGES.planId },
      ]);
    });
  });

  it('reports every invalid field, one entry each', () => {
    const fields = fieldsOf(LeadRequestSchema, {});
    expect(fields.map((f) => f.field).sort()).toEqual(
      ['fullName', 'grossWeightGrams', 'karat', 'mobileNumber', 'netWeightGrams', 'planId'].sort(),
    );
  });
});

describe('zodToFields', () => {
  it('keeps only the first issue per field', () => {
    // 1000.0001 breaks both "<= 1000" and "max 3 decimals"
    expect(fieldsOf(QuoteRequestSchema, { ...validQuote, netWeightGrams: 1, grossWeightGrams: 1000.0001 })).toEqual([
      { field: 'grossWeightGrams', message: MESSAGES.grossWeight },
    ]);
  });

  it('maps a root-level error to field "body"', () => {
    expect(fieldsOf(QuoteRequestSchema, 'not an object')).toEqual([
      { field: 'body', message: expect.any(String) },
    ]);
  });
});
