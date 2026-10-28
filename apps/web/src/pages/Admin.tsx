import type { SchemeDto } from '@goldloan/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getLoanSchemes } from '../api/endpoints';
import { Button } from '../components/Button';
import { LeadsList } from '../components/LeadsList';
import { useLeads } from '../hooks/useLeads';

export function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const planId = searchParams.get('planId') || null;
  const leads = useLeads(planId);
  const [schemes, setSchemes] = useState<SchemeDto[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    // The filter still works with "All plans" only if this fails, so the error is not shown.
    getLoanSchemes(controller.signal).then(setSchemes, () => {});
    return () => controller.abort();
  }, []);

  const loading = leads.status === 'loading';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Leads</h1>
        <p className="text-slate-600">All applications, newest first. Mobile numbers are masked.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="planFilter" className="text-sm font-medium text-slate-800">
            Plan
          </label>
          <select
            id="planFilter"
            value={planId ?? ''}
            onChange={(e) => setSearchParams(e.target.value ? { planId: e.target.value } : {}, { replace: true })}
            className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <option value="">All plans</option>
            {schemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={leads.reload} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {leads.status === 'error' && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-800">{leads.error}</p>
          <Button variant="secondary" onClick={leads.reload}>
            Try again
          </Button>
        </div>
      )}

      {loading && leads.leads.length === 0 && (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">Loading applications…</span>
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
        </div>
      )}

      {leads.status === 'success' && (
        <p aria-live="polite" className="text-sm text-slate-600">
          {leads.total === 1 ? '1 application' : `${leads.total} applications`}
        </p>
      )}

      {leads.status === 'success' && leads.leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-900">{planId ? 'No applications for this plan yet' : 'No applications yet'}</p>
          <p className="mt-1 text-sm text-slate-500">New applications from the form and Loan Assist appear here.</p>
        </div>
      )}

      {leads.leads.length > 0 && leads.status !== 'error' && (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <LeadsList leads={leads.leads} />
        </div>
      )}
    </div>
  );
}
