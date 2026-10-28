import { formatGrams, formatINR } from '@goldloan/shared';
import { useEffect } from 'react';
import { useDebouncedQuote } from '../../hooks/useDebouncedQuote';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
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
  const online = useOnlineStatus();
  const { status, quote, retry } = live;

  useEffect(() => {
    if (status === 'success' && quote) dispatch({ type: 'quoteLoaded', quote });
  }, [status, quote, dispatch]);

  // Back online after a failed request: fetch the quote again without making the user ask.
  // Runs only when `online` flips (not on every error), so a failing API is not retried in a loop.
  useEffect(() => {
    if (online && status === 'error') retry();
  }, [online]);

  const current = status === 'success' && isQuoteCurrent(quote, details);
  // While a newer quote loads, keep showing the previous one (Next stays disabled until it is current).
  // After an error or with invalid inputs it can't be refreshed, so hide it rather than show old numbers.
  const shownQuote = current || status === 'loading' ? quote : null;
  const planOffered = !!quote?.plans.some((plan) => plan.planId === state.planId);
  const errorFor = (field: DetailsField) => visibleError(state, errors, field);
  const touch = (field: DetailsField) => () => dispatch({ type: 'touch', field });

  const announcement =
    status === 'loading'
      ? 'Updating your quote…'
      : current
        ? `Quote updated. Pure gold ${formatGrams(quote.pureGoldGrams)}, gold value ${formatINR(quote.goldValueRupees)}.`
        : '';

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

      <div className="flex flex-col gap-5">
        <p role="status" className="sr-only">
          {announcement}
        </p>

        {status === 'error' && live.error && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-red-800">
              {online ? live.error.message : 'You are offline. Your quote will update when the connection is back.'}
            </p>
            <Button variant="secondary" onClick={retry} className="sm:shrink-0">
              Try again
            </Button>
          </div>
        )}

        {status === 'idle' && <p className="text-sm text-slate-600">Enter valid weights and karat to see your quote.</p>}

        {shownQuote ? (
          <>
            {!current && (
              <p aria-hidden="true" className="text-sm text-slate-600">
                Updating your quote…
              </p>
            )}
            <QuoteSummary quote={shownQuote} />
            <PlanCards
              plans={shownQuote.plans}
              selectedPlanId={state.planId}
              onSelect={(planId) => dispatch({ type: 'selectPlan', planId })}
            />
          </>
        ) : (
          status === 'loading' && <QuoteSkeleton />
        )}
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
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
