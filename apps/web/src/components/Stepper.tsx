const STEPS = ['Details', 'Quote', 'Confirm'] as const;

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Application progress">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const state = step < current ? 'done' : step === current ? 'current' : 'upcoming';
          return (
            <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="flex flex-col gap-2">
              <span
                className={`h-1.5 rounded-full ${state === 'upcoming' ? 'bg-slate-200' : 'bg-brand-600'}`}
                aria-hidden="true"
              />
              <span
                className={`text-sm ${
                  state === 'current' ? 'font-semibold text-brand-800' : state === 'done' ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                <span className="sr-only">{`Step ${step}: `}</span>
                <span aria-hidden="true">{`${step}. `}</span>
                {label}
                {state === 'done' && <span className="sr-only"> (completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
