import { formatGrams, formatINR } from '@goldloan/shared';
import type { ReactNode } from 'react';
import type { ChatItem } from '../../hooks/useLoanAssist';
import { displayMobile } from '../../lib/mobile';
import { Button } from '../Button';

type Confirmation = Extract<ChatItem, { kind: 'confirmation' }>;

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </>
  );
}

/** The user's explicit consent step: nothing is submitted until "Confirm & submit" is pressed here. */
export function ConfirmationCard({
  item,
  onConfirm,
  onCancel,
}: {
  item: Confirmation;
  onConfirm: (pendingId: string) => void;
  onCancel: (pendingId: string) => void;
}) {
  const { summary, state } = item;
  const decided = state !== 'ready';

  return (
    <section
      aria-label="Confirm your application"
      className={`rounded-xl border p-4 ${state === 'created' ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-white'}`}
    >
      <p className="font-semibold text-slate-900">
        {state === 'created' ? 'Application submitted' : 'Check and confirm your application'}
      </p>

      {state === 'created' && item.lead ? (
        <div className="mt-3">
          <p className="text-sm text-brand-800">Application ID</p>
          <p className="font-mono text-3xl font-semibold tracking-tight text-slate-900">{item.lead.applicationId}</p>
        </div>
      ) : null}

      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
        <Row label="Name" value={summary.fullName} />
        <Row label="Mobile" value={displayMobile(summary.mobileNumber)} />
        <Row label="Gross weight" value={formatGrams(summary.grossWeightGrams)} />
        <Row label="Net weight" value={formatGrams(summary.netWeightGrams)} />
        <Row label="Karat" value={`${summary.karat}K`} />
        <Row label="Plan" value={summary.planName} />
        <Row label="Interest" value={`${summary.annualInterestRate}% p.a., ${summary.tenureMonths} months`} />
        <Row label="Pure gold" value={formatGrams(summary.pureGoldGrams)} />
        <Row label="Gold value" value={formatINR(summary.goldValueRupees)} />
        <Row label="Eligible loan" value={<span className="text-base">{formatINR(summary.eligibleLoan)}</span>} />
      </dl>
      <p className="mt-2 text-xs text-slate-600">
        Preliminary offer at {formatINR(summary.rate24kPerGram)}/g (24K). The final amount depends on a physical check.
      </p>

      {item.message && (
        <p
          role={state === 'failed' || state === 'ready' ? 'alert' : undefined}
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state === 'failed' || state === 'ready' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'
          }`}
        >
          {item.message}
        </p>
      )}
      {state === 'cancelled' && <p className="mt-3 text-sm text-slate-700">Cancelled. Nothing was sent.</p>}

      {(state === 'ready' || state === 'confirming' || state === 'cancelling') && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => onConfirm(item.pendingId)} disabled={decided} className="sm:flex-1">
            {state === 'confirming' ? 'Submitting…' : 'Confirm & submit'}
          </Button>
          <Button variant="secondary" onClick={() => onCancel(item.pendingId)} disabled={decided}>
            {state === 'cancelling' ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      )}
    </section>
  );
}
