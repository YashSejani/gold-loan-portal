import { describe, expect, it } from 'vitest';
import {
  formatDateShortIST,
  formatDateTimeIST,
  formatGrams,
  formatINR,
  formatPercent,
  maskMobile,
  maskMobilesInText,
} from '../src/format';

describe('maskMobile', () => {
  it('keeps first 4 and last 2 digits', () => {
    expect(maskMobile('9876543210')).toBe('9876XXXX10');
  });

  it.each([['98765'], [''], ['+919876543210'], ['98765432101']])('fully masks malformed input %j', (input) => {
    expect(maskMobile(input)).toBe('XXXXXXXXXX');
  });
});

describe('formatINR', () => {
  it.each([
    [216_562, '₹2,16,562'],
    [288_750, '₹2,88,750'],
    [5_250_000, '₹52,50,000'],
    [79_213.75, '₹79,213.75'],
    [6.4, '₹6.40'],
    [0, '₹0'],
  ])('%s → %s', (amount, expected) => {
    expect(formatINR(amount)).toBe(expected);
  });
});

describe('formatDateShortIST', () => {
  it('formats as "3 Oct"', () => {
    expect(formatDateShortIST('2026-10-03T06:00:00Z')).toBe('3 Oct');
  });

  it('uses Asia/Kolkata, not UTC (20:00 UTC on 2 Oct is 01:30 IST on 3 Oct)', () => {
    expect(formatDateShortIST('2026-10-02T20:00:00Z')).toBe('3 Oct');
    expect(formatDateShortIST(new Date('2026-10-02T20:00:00Z'))).toBe('3 Oct');
  });
});

describe('maskMobilesInText', () => {
  it('masks every mobile in a sentence and leaves other numbers alone', () => {
    expect(maskMobilesInText('Call 9876543210 or 9123456789, ref 12345678901 and pin 560001')).toBe(
      'Call 9876XXXX10 or 9123XXXX89, ref 12345678901 and pin 560001',
    );
  });

  it('does not mask numbers starting with 0-5 or embedded in longer digit runs', () => {
    expect(maskMobilesInText('5876543210 and 198765432100')).toBe('5876543210 and 198765432100');
  });
});

describe('formatGrams', () => {
  it.each([
    [41.25, '41.25 g'],
    [7.5, '7.5 g'],
    [11.316, '11.316 g'],
    [1000, '1,000 g'],
  ])('%s → %s', (value, expected) => {
    expect(formatGrams(value)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it.each([
    [0.75, '75%'],
    [0.7, '70%'],
    [0.105, '10.5%'],
  ])('%s → %s', (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });
});

describe('formatDateTimeIST', () => {
  it('formats in en-IN, Asia/Kolkata', () => {
    expect(formatDateTimeIST('2026-10-28T06:30:00.000Z')).toBe('28 Oct 2026, 12:00 pm');
  });

  it('rolls the date over to IST (20:00 UTC on 2 Oct is 01:30 IST on 3 Oct)', () => {
    expect(formatDateTimeIST('2026-10-02T20:00:00.000Z')).toBe('3 Oct 2026, 1:30 am');
  });
});
