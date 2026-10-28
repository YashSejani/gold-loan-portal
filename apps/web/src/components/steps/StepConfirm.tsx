import { formatDateShortIST, formatGrams, formatINR, formatPercent } from '@goldloan/shared';
import { useState, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { postLead } from '../../api/endpoints';
import { useApplyForm } from '../../state/applyForm';
import { validateDetails, type DetailsDraft } from '../../state/details';
import { Button } from '../Button';
import { rateLabel } from '../QuoteSummary';

interface Duplicate {
  applicationId: string;
  submittedAt: string;
}

function ReviewGroup({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <Button variant="link" onClick={onEdit} aria-label={editLabel}>
          Edit
        </Button>
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </>
  );
}

function grams(text: string) {
  return formatGrams(Number(text));
}

export function StepConfirm() {
  const { state, dispatch } = useApplyForm();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  const { data } = validateDetails(state.details);
  const plan = state.quote?.plans.find((p) => p.planId === state.planId);
  if (!data || !state.quote || !plan) return null; // only reachable through steps 1 and 2

  const details: DetailsDraft = state.details;

  async function submit() {
    if (pending || !data || !plan) return;
    setPending(true);
    setError(null);
    try {
      const lead = await postLead({ ...data, planId: plan.planId, channel: 'FORM' });
      dispatch({ type: 'submitted', lead });
    } catch (err) {
      setPending(false);
      if (!(err instanceof ApiError)) {
        setError('Something went wrong. Please try again.');
      } else if (err.code === 'DUPLICATE_APPLICATION') {
        setDuplicate({
          applicationId: String(err.details?.existingApplicationId ?? ''),
          submittedAt: String(err.details?.existingSubmittedAt ?? ''),
        });
      } else if (err.code === 'PLAN_NOT_FOUND') {
        dispatch({ type: 'planUnavailable' });
      } else if (err.code === 'VALIDATION_ERROR' && err.fields.length > 0) {
        dispatch({ type: 'serverFieldErrors', fields: err.fields });
      } else {
        setError(err.message);
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Review your application" className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:p-5">
        <ReviewGroup title="Your details" editLabel="Edit your details" onEdit={() => dispatch({ type: 'goTo', step: 1 })}>
          <Row label="Name" value={data.fullName} />
          <Row label="Mobile" value={data.mobileNumber} />
        </ReviewGroup>
        <ReviewGroup title="Jewellery" editLabel="Edit jewellery" onEdit={() => dispatch({ type: 'goTo', step: 2 })}>
          <Row label="Gross weight" value={grams(details.grossWeightGrams)} />
          <Row label="Net weight" value={grams(details.netWeightGrams)} />
          <Row label="Karat" value={`${data.karat}K`} />
        </ReviewGroup>
        <ReviewGroup title="Plan and offer" editLabel="Change plan" onEdit={() => dispatch({ type: 'goTo', step: 2 })}>
          <Row label="Plan" value={plan.planName} />
          <Row label="Eligible loan" value={<span className="text-base">{formatINR(plan.eligibleLoan)}</span>} />
          <Row label="Pure gold" value={formatGrams(state.quote.pureGoldGrams)} />
          <Row label="Gold value" value={formatINR(state.quote.goldValueRupees)} />
          <Row label="Rate used" value={rateLabel(state.quote)} />
          <Row label="Interest" value={`${plan.annualInterestRate}% p.a.`} />
          <Row label="Tenure" value={`${plan.tenureMonths} months`} />
          <Row label="Loan to value" value={formatPercent(plan.appliedLtv)} />
        </ReviewGroup>
      </section>

      <p className="text-sm text-slate-500">
        This is a preliminary offer. The final amount depends on a physical check of your jewellery.
      </p>

      {duplicate ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-amber-900">
            {`You already applied on ${formatDateShortIST(duplicate.submittedAt)}, application ${duplicate.applicationId}.`}
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: 'reset' })} className="sm:self-start">
            Start a new application
          </Button>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => dispatch({ type: 'goTo', step: 2 })} disabled={pending}>
              Back
            </Button>
            <Button onClick={submit} disabled={pending} aria-busy={pending} className="sm:min-w-48">
              {pending ? 'Submitting…' : 'Submit application'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
