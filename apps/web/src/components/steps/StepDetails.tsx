import type { FormEvent } from 'react';
import { useApplyForm, visibleError } from '../../state/applyForm';
import { decimalOnly, digitsOnly, validateDetails, type DetailsField } from '../../state/details';
import { KaratPicker } from '../KaratPicker';
import { TextField } from '../TextField';

export function StepDetails() {
  const { state, dispatch } = useApplyForm();
  const { details } = state;
  const { data, errors } = validateDetails(details);

  // Errors appear after a field's first blur, then follow every keystroke.
  const errorFor = (field: DetailsField) => visibleError(state, errors, field);
  const touch = (field: DetailsField) => () => dispatch({ type: 'touch', field });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (data) dispatch({ type: 'goTo', step: 2 });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        id="fullName"
        label="Full name"
        autoComplete="name"
        value={details.fullName}
        error={errorFor('fullName')}
        onChange={(e) => dispatch({ type: 'setField', field: 'fullName', value: e.target.value })}
        onBlur={touch('fullName')}
      />
      <TextField
        id="mobileNumber"
        label="Mobile number"
        hint="10 digits, without +91"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        maxLength={10}
        value={details.mobileNumber}
        error={errorFor('mobileNumber')}
        onChange={(e) => dispatch({ type: 'setField', field: 'mobileNumber', value: digitsOnly(e.target.value, 10) })}
        onBlur={touch('mobileNumber')}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="grossWeightGrams"
          label="Gross weight"
          hint="Total weight, including stones"
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
          hint="Gold only, excluding stones"
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
        onChange={(karat) => {
          dispatch({ type: 'setField', field: 'karat', value: karat });
          dispatch({ type: 'touch', field: 'karat' });
        }}
        onBlur={touch('karat')}
      />

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="submit"
          disabled={!data}
          className="h-12 w-full rounded-lg bg-brand-700 px-5 text-base font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:ml-auto sm:w-auto sm:min-w-40"
        >
          Next
        </button>
        {!data && <p className="text-sm text-slate-500 sm:text-right">Fill in all fields to see your quote.</p>}
      </div>
    </form>
  );
}
