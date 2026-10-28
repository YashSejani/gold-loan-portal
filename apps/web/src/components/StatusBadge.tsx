import type { LeadStatus } from '@goldloan/shared';

const STATUS: Record<LeadStatus, { label: string; className: string }> = {
  SUBMITTED: { label: 'Submitted', className: 'bg-brand-50 text-brand-800 ring-brand-200' },
  UNDER_REVIEW: { label: 'Under review', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-800 ring-red-200' },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}
