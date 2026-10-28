import { Stepper } from '../components/Stepper';
import { StepDetails } from '../components/steps/StepDetails';
import { ApplyFormProvider, useApplyForm } from '../state/applyForm';

const STEP_TITLES = {
  1: 'Your details',
  2: 'Your quote',
  3: 'Review and submit',
} as const;

function ApplyFlow() {
  const { state, dispatch } = useApplyForm();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Apply for a gold loan</h1>
        <p className="text-slate-600">
          Get a preliminary offer in three steps. The final amount depends on a physical check of your jewellery.
        </p>
      </header>

      <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <Stepper current={state.step} />
        <h2 className="text-lg font-semibold text-slate-900">{STEP_TITLES[state.step]}</h2>

        {state.step === 1 && <StepDetails />}

        {state.step > 1 && (
          // Placeholder until the quote and confirm steps are built.
          <div className="flex flex-col gap-4">
            <p className="text-slate-600">This step is coming next.</p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'goTo', step: 1 })}
              className="h-12 rounded-lg border border-slate-300 bg-white px-5 font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:w-auto sm:self-start"
            >
              Back
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export function ApplyPage() {
  return (
    <ApplyFormProvider>
      <ApplyFlow />
    </ApplyFormProvider>
  );
}
