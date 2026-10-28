import { KARATS, type Karat } from '@goldloan/shared';
import type { FocusEvent } from 'react';

interface KaratPickerProps {
  value: Karat | null;
  error?: string;
  onChange: (karat: Karat) => void;
  onBlur: () => void;
}

/** Segmented control built on native radios: arrow keys, labels and form semantics come for free. */
export function KaratPicker({ value, error, onChange, onBlur }: KaratPickerProps) {
  const errorId = 'karat-error';
  const hintId = 'karat-hint';

  // Only count as "blurred" once focus leaves the whole group, not when moving between options.
  function handleBlur(event: FocusEvent<HTMLFieldSetElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) onBlur();
  }

  return (
    <fieldset aria-describedby={[error ? errorId : null, hintId].filter(Boolean).join(' ')} onBlur={handleBlur}>
      <legend className="mb-1.5 text-sm font-medium text-slate-800">Karat (purity)</legend>
      <div className={`grid grid-cols-3 gap-1 rounded-lg border bg-slate-100 p-1 ${error ? 'border-red-600' : 'border-slate-200'}`}>
        {KARATS.map((karat) => (
          <label key={karat} className="relative">
            <input
              type="radio"
              name="karat"
              value={karat}
              checked={value === karat}
              onChange={() => onChange(karat)}
              className="peer sr-only"
            />
            <span className="flex h-11 cursor-pointer items-center justify-center rounded-md text-base font-medium text-slate-600 transition-colors peer-checked:bg-white peer-checked:text-brand-800 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 hover:text-slate-900">
              {karat}K
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
      <p id={hintId} className="mt-1.5 text-sm text-slate-500">
        22K is the most common for jewellery.
      </p>
    </fieldset>
  );
}
