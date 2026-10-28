import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  id: string;
  label: string;
  hint?: string;
  /** Short unit shown inside the input, e.g. "g". */
  suffix?: string;
  error?: string;
}

export function TextField({ id, label, hint, suffix, error, ...inputProps }: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-lg border bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
            suffix ? 'pr-10' : ''
          } ${
            error
              ? 'border-red-600 focus-visible:ring-red-600'
              : 'border-slate-300 hover:border-slate-400 focus-visible:border-brand-700 focus-visible:ring-brand-600'
          }`}
          {...inputProps}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-slate-500" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      <p id={errorId} aria-live="polite" className={error ? 'text-sm text-red-700' : 'sr-only'}>
        {error}
      </p>
      {hint && (
        <p id={hintId} className="text-sm text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
