import { useEffect } from 'react';
import { useDebouncedQuote } from '../../hooks/useDebouncedQuote';
import { useApplyForm, visibleError } from '../../state/applyForm';
import { decimalOnly, isQuoteCurrent, quoteInputFrom, validateDetails, type DetailsField } from '../../state/details';
import { Button } from '../Button';
import { KaratPicker } from '../KaratPicker';
import { PlanCards } from '../PlanCards';
import { QuoteSkeleton, QuoteSummary } from '../QuoteSummary';
import { TextField } from '../TextField';

export function StepQuote() {
  const { state, dispatch } = useApplyForm();
  const { details } = state;
  const { errors } = validateDetails(details);
  const input = quoteInputFrom(details);
  const live = useDebouncedQuote(input.net, input.gross, input.karat, state.quoteRefresh);

  useEffect(() => {
    if (live.status === 'success' && live.quote) dispatch({ type: 'quoteLoaded', quote: live.quote });
  }, [live.status, live.quote, dispatch]);

  const quote = live.quote;
  const current = live.status === 'success' && isQuoteCurrent(quote, details);
  const planOffered = !!quote?.plans.some((plan) => plan.planId === state.planId);
  const errorFor = (field: DetailsField) => visibleError(state, errors, field);
  const touch = (field: DetailsField) => () => dispatch({ type: 'touch', field });

  return (
    <div className="flex flex-col gap-6">
      {state.notice && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {state.notice}
        </p>
      )}

      <div className="flex flex-col gap-5">
        <p className="text-sm text-slate-600">Change the weight or karat to see your quote update.</p>
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <TextField
            id="grossWeightGrams"
            label="Gross weight"
            inputMode="decimal"
            autoComplete="off"
            suffix="g"
            value={details.grossWeightGrams}
            error={errorFor('grossWeightGrams')}
            onChange={(e) => dispatch({ type: 'setField', field: 'grossWeightGrams', value: decimalOnly(e.target.value) })}
            onBlur={touch('grossWeightGrams')}
          />
          <TextField
            id="netWeightGrams"
            label="Net weight"
            inputMode="decimal"
            autoComplete="off"
            suffix="g"
            value={details.netWeightGrams}
            error={errorFor('netWeightGrams')}
            onChange={(e) => dispatch({ type: 'setField', field: 'netWeightGrams', value: decimalOnly(e.target.value) })}
            onBlur={touch('netWeightGrams')}
          />
        </div>
        <KaratPicker
          value={details.karat}
          error={errorFor('karat')}
          onChange={(karat) => dispatch({ type: 'setField', field: 'karat', value: karat })}
          onBlur={touch('karat')}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-5">
        {live.status === 'error' && live.error && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-800">{live.error.message}</p>
            <Button variant="secondary" onClick={live.retry} className="sm:shrink-0">
              Try again
            </Button>
          </div>
        )}

        {quote ? (
          <>
            {!current && live.status === 'loading' && <p className="text-sm text-slate-500">Updating your quote…</p>}
            {live.status === 'idle' && <p className="text-sm text-slate-500">Fix the weights above to update your quote.</p>}
            <QuoteSummary quote={quote} stale={!current} />
            <PlanCards
              plans={quote.plans}
              selectedPlanId={state.planId}
              onSelect={(planId) => dispatch({ type: 'selectPlan', planId })}
              stale={!current}
            />
          </>
        ) : (
          live.status !== 'error' && live.status !== 'idle' && <QuoteSkeleton />
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={() => dispatch({ type: 'goTo', step: 1 })}>
          Back
        </Button>
        <Button
          disabled={!current || !planOffered}
          onClick={() => dispatch({ type: 'goTo', step: 3 })}
          className="sm:min-w-40"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
