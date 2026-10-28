import { Stepper } from '../components/Stepper';
import { SubmittedScreen } from '../components/SubmittedScreen';
import { StepConfirm } from '../components/steps/StepConfirm';
import { StepDetails } from '../components/steps/StepDetails';
import { StepQuote } from '../components/steps/StepQuote';
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

      {state.submitted ? (
        <SubmittedScreen lead={state.submitted} onStartOver={() => dispatch({ type: 'reset' })} />
      ) : (
        <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <Stepper current={state.step} />
          <h2 className="text-lg font-semibold text-slate-900">{STEP_TITLES[state.step]}</h2>
          {state.step === 1 && <StepDetails />}
          {state.step === 2 && <StepQuote />}
          {state.step === 3 && <StepConfirm />}
        </section>
      )}
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
