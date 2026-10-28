import { formatDateTimeIST, formatGrams, formatINR, type LeadDto } from '@goldloan/shared';
import { displayMobile } from '../lib/mobile';
import { StatusBadge } from './StatusBadge';

const COLUMNS = ['Application ID', 'Name', 'Mobile', 'Net weight', 'Karat', 'Plan', 'Loan', 'Status', 'Submitted'];

/** Table from 768 px; below that the same leads as stacked cards (display:none hides the other one). */
export function LeadsList({ leads }: { leads: LeadDto[] }) {
  return (
    <>
      {/* Focusable so keyboard users can scroll it when the columns don't fit. */}
      <div
        role="region"
        aria-label="Leads table"
        tabIndex={0}
        className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:block"
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.applicationId} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-slate-900">{lead.applicationId}</td>
                <td className="px-4 py-3 text-slate-900">{lead.fullName}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">{displayMobile(lead.mobileNumber)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatGrams(lead.netWeightGrams)}</td>
                <td className="px-4 py-3 text-slate-700">{`${lead.karat}K`}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{lead.planName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-slate-900">{formatINR(lead.eligibleLoan)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTimeIST(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label="Applications" className="flex flex-col gap-3 md:hidden">
        {leads.map((lead) => (
          <li key={lead.applicationId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono font-semibold text-slate-900">{lead.applicationId}</span>
              <StatusBadge status={lead.status} />
            </div>
            <p className="mt-1 font-medium text-slate-900">{lead.fullName}</p>
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatINR(lead.eligibleLoan)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Mobile</dt>
                <dd className="font-mono text-slate-800">{displayMobile(lead.mobileNumber)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Plan</dt>
                <dd className="text-slate-800">{lead.planName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Net weight</dt>
                <dd className="text-slate-800">{`${formatGrams(lead.netWeightGrams)}, ${lead.karat}K`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Submitted</dt>
                <dd className="text-slate-800">{formatDateTimeIST(lead.createdAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
