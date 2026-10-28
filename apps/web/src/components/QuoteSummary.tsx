import { formatGrams, formatINR, type QuoteDto } from '@goldloan/shared';

export function rateLabel(quote: QuoteDto) {
  return `${formatINR(quote.rate24kPerGram)}/g (24K)`;
}

export function QuoteSummary({ quote, stale = false }: { quote: QuoteDto; stale?: boolean }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 transition-opacity sm:grid-cols-3 ${stale ? 'opacity-50' : ''}`}
    >
      <div>
        <dt className="text-sm text-slate-500">Pure gold</dt>
        <dd className="text-lg font-semibold text-slate-900">{formatGrams(quote.pureGoldGrams)}</dd>
      </div>
      <div>
        <dt className="text-sm text-slate-500">Gold value</dt>
        <dd className="text-lg font-semibold text-slate-900">{formatINR(quote.goldValueRupees)}</dd>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <dt className="text-sm text-slate-500">Rate used</dt>
        <dd className="text-lg font-semibold text-slate-900">{rateLabel(quote)}</dd>
      </div>
    </dl>
  );
}

export function QuoteSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Calculating your quote…</span>
      <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}
