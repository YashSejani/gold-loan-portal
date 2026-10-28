import { formatGrams, formatINR, type QuoteDto } from '@goldloan/shared';

/** Structured quote from the calculate_quote tool result (server numbers, not the model's text). */
export function QuoteCard({ quote }: { quote: QuoteDto }) {
  return (
    <section
      aria-label={`Quote for ${formatGrams(quote.input.netWeightGrams)} of ${quote.input.karat}K gold`}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <p className="text-sm font-semibold text-slate-900">
        Quote · {formatGrams(quote.input.netWeightGrams)} net, {quote.input.karat}K
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Pure gold</dt>
          <dd className="font-medium text-slate-900">{formatGrams(quote.pureGoldGrams)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Gold value</dt>
          <dd className="font-medium text-slate-900">{formatINR(quote.goldValueRupees)}</dd>
        </div>
      </dl>
      <ul className="mt-3 flex flex-col gap-2">
        {quote.plans.map((plan) => (
          <li key={plan.planId} className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{plan.planName}</span>
              <span className="block text-xs text-slate-600">
                {plan.annualInterestRate}% p.a. · {plan.tenureMonths} months
              </span>
            </span>
            <span className="text-base font-semibold text-slate-900">{formatINR(plan.eligibleLoan)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-600">Rate used {formatINR(quote.rate24kPerGram)}/g (24K). Preliminary offer.</p>
    </section>
  );
}
