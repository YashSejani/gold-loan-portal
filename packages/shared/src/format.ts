const MOBILE_IN_TEXT = /(?<!\d)([6-9]\d{3})\d{4}(\d{2})(?!\d)/g;

/** "9876543210" → "9876XXXX10". Anything that is not exactly 10 digits is fully masked. */
export function maskMobile(mobile: string): string {
  if (!/^\d{10}$/.test(mobile)) return 'XXXXXXXXXX';
  return `${mobile.slice(0, 4)}XXXX${mobile.slice(8)}`;
}

/** Masks every Indian mobile number inside free text, for logs (CLAUDE.md §9.5). */
export function maskMobilesInText(text: string): string {
  return text.replace(MOBILE_IN_TEXT, '$1XXXX$2');
}

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Indian grouping: 216562 → "₹2,16,562"; 79213.75 → "₹79,213.75". Display only. */
export function formatINR(rupees: number): string {
  return (Number.isInteger(rupees) ? inrWhole : inrPaise).format(rupees);
}

const shortDateIST = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});

/** "3 Oct", in Asia/Kolkata. */
export function formatDateShortIST(date: Date | string): string {
  return shortDateIST.format(typeof date === 'string' ? new Date(date) : date);
}

const grams = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** 41.25 → "41.25 g". Display only. */
export function formatGrams(value: number): string {
  return `${grams.format(value)} g`;
}

const percent = new Intl.NumberFormat('en-IN', { style: 'percent', maximumFractionDigits: 2 });

/** A ratio from the API (0.75) → "75%". Intl does the scaling; no maths in the UI. */
export function formatPercent(ratio: number): string {
  return percent.format(ratio);
}
