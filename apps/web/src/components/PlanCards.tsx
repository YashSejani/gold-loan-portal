import { formatINR, formatPercent, type PlanQuoteDto, type RepaymentType } from '@goldloan/shared';

const REPAYMENT_LABELS: Record<RepaymentType, string> = {
  BULLET: 'Bullet: interest and principal at maturity',
  EMI: 'Equal monthly instalments',
};

interface PlanCardsProps {
  plans: PlanQuoteDto[];
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  /** Dimmed while a newer quote is loading. */
  stale?: boolean;
}

/** One selectable card per plan, built on native radios (arrow keys move between plans). */
export function PlanCards({ plans, selectedPlanId, onSelect, stale = false }: PlanCardsProps) {
  return (
    <fieldset className={`flex flex-col gap-3 transition-opacity ${stale ? 'opacity-50' : ''}`}>
      <legend className="mb-3 text-sm font-medium text-slate-800">Choose a plan</legend>
      {plans.map((plan) => {
        const nameId = `plan-${plan.planId}-name`;
        const detailsId = `plan-${plan.planId}-details`;
        return (
          <label
            key={plan.planId}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:ring-1 has-checked:ring-brand-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-700 sm:p-5"
          >
            <input
              type="radio"
              name="plan"
              value={plan.planId}
              checked={selectedPlanId === plan.planId}
              onChange={() => onSelect(plan.planId)}
              aria-labelledby={nameId}
              aria-describedby={detailsId}
              className="sr-only"
            />
            <div className="flex items-baseline justify-between gap-3">
              <span id={nameId} className="font-semibold text-slate-900">
                {plan.planName}
              </span>
              <span className="text-sm text-slate-500">{selectedPlanId === plan.planId ? 'Selected' : ''}</span>
            </div>
            <div id={detailsId}>
              <p className="mt-3 text-sm text-slate-500">You can borrow up to</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">{formatINR(plan.eligibleLoan)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-500">Interest</dt>
                  <dd className="font-medium text-slate-800">{plan.annualInterestRate}% p.a.</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tenure</dt>
                  <dd className="font-medium text-slate-800">{plan.tenureMonths} months</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Loan to value</dt>
                  <dd className="font-medium text-slate-800">{formatPercent(plan.appliedLtv)}</dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-slate-500">Repayment</dt>
                  <dd className="font-medium text-slate-800">{REPAYMENT_LABELS[plan.repaymentType]}</dd>
                </div>
              </dl>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
