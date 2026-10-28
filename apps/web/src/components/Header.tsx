import { NavLink } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-2">
        <span className="text-base font-semibold tracking-tight text-slate-900">
          Gold Loan <span className="text-brand-700">Portal</span>
        </span>
        <nav aria-label="Main" className="flex gap-1">
          <NavLink to="/" end className={linkClass}>
            Apply
          </NavLink>
          <NavLink to="/admin" className={linkClass}>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
