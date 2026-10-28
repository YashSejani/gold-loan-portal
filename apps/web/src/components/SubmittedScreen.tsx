import { formatINR, type LeadDto } from '@goldloan/shared';
import { useEffect, useRef, useState } from 'react';
import { displayMobile } from '../lib/mobile';
import { Button } from './Button';

export function SubmittedScreen({ lead, onStartOver }: { lead: LeadDto; onStartOver: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The Submit button is gone: put focus on the confirmation so it is read out.
  useEffect(() => headingRef.current?.focus(), []);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(lead.applicationId);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-slate-900 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">
          Application submitted
        </h2>
        <p className="text-slate-600">Keep your application ID for any follow-up.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-brand-800">Application ID</p>
          <p className="font-mono text-4xl font-semibold tracking-tight text-slate-900">{lead.applicationId}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={copyId} aria-label="Copy application ID">
            Copy
          </Button>
          <span role="status" className="text-sm text-brand-800">
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed, select the ID instead' : ''}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Name</dt>
        <dd className="text-right font-medium text-slate-900">{lead.fullName}</dd>
        <dt className="text-slate-500">Mobile</dt>
        <dd className="text-right font-medium text-slate-900">{displayMobile(lead.mobileNumber)}</dd>
        <dt className="text-slate-500">Plan</dt>
        <dd className="text-right font-medium text-slate-900">{lead.planName}</dd>
        <dt className="text-slate-500">Eligible loan</dt>
        <dd className="text-right font-medium text-slate-900">{formatINR(lead.eligibleLoan)}</dd>
        <dt className="text-slate-500">Status</dt>
        <dd className="text-right font-medium text-slate-900">Submitted</dd>
      </dl>

      <p className="text-sm text-slate-500">
        This is a preliminary offer. The final amount depends on a physical check of your jewellery.
      </p>

      <Button onClick={onStartOver} className="sm:self-start">
        Start new application
      </Button>
    </section>
  );
}
