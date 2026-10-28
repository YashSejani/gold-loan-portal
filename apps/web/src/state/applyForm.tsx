import type { FieldError, LeadDto, QuoteDto } from '@goldloan/shared';
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { EMPTY_DETAILS, isDetailsField, type DetailsDraft, type DetailsErrors, type DetailsField } from './details';

export type Step = 1 | 2 | 3;

export const PLAN_UNAVAILABLE_MESSAGE = 'That plan is no longer available, please pick another.';

/** All Apply-flow state lives here so the three steps share one source of truth. */
export interface ApplyState {
  step: Step;
  details: DetailsDraft;
  /** Fields that have been blurred at least once: their errors are shown from then on. */
  touched: Partial<Record<DetailsField, true>>;
  /** Field errors returned by the API (400); each clears when that field is edited. */
  serverErrors: DetailsErrors;
  /** Latest quote from the server for the current inputs (never computed in the browser). */
  quote: QuoteDto | null;
  /** Bumped to force a fresh quote with unchanged inputs (e.g. after a plan disappears). */
  quoteRefresh: number;
  planId: string | null;
  /** Message shown at the top of the quote step. */
  notice: string | null;
  submitted: LeadDto | null;
}

export type ApplyAction =
  | { [F in DetailsField]: { type: 'setField'; field: F; value: DetailsDraft[F] } }[DetailsField]
  | { type: 'touch'; field: DetailsField }
  | { type: 'goTo'; step: Step }
  | { type: 'quoteLoaded'; quote: QuoteDto }
  | { type: 'selectPlan'; planId: string }
  | { type: 'serverFieldErrors'; fields: FieldError[] }
  | { type: 'planUnavailable' }
  | { type: 'submitted'; lead: LeadDto }
  | { type: 'reset' };

export const initialApplyState: ApplyState = {
  step: 1,
  details: EMPTY_DETAILS,
  touched: {},
  serverErrors: {},
  quote: null,
  quoteRefresh: 0,
  planId: null,
  notice: null,
  submitted: null,
};

export function applyReducer(state: ApplyState, action: ApplyAction): ApplyState {
  switch (action.type) {
    case 'setField': {
      const { [action.field]: _cleared, ...serverErrors } = state.serverErrors;
      return { ...state, details: { ...state.details, [action.field]: action.value }, serverErrors };
    }
    case 'touch':
      return state.touched[action.field] ? state : { ...state, touched: { ...state.touched, [action.field]: true } };
    case 'goTo':
      return { ...state, step: action.step };
    case 'quoteLoaded': {
      const planStillOffered = action.quote.plans.some((plan) => plan.planId === state.planId);
      return { ...state, quote: action.quote, planId: planStillOffered ? state.planId : null };
    }
    case 'selectPlan':
      return { ...state, planId: action.planId, notice: null };
    case 'serverFieldErrors': {
      const serverErrors: DetailsErrors = {};
      const touched = { ...state.touched };
      for (const { field, message } of action.fields) {
        if (!isDetailsField(field)) continue;
        serverErrors[field] ??= message;
        touched[field] = true;
      }
      // Jump to the step that owns the field: details live on step 1, the plan on step 2.
      const step: Step = Object.keys(serverErrors).length > 0 ? 1 : 2;
      return { ...state, serverErrors, touched, step };
    }
    case 'planUnavailable':
      return {
        ...state,
        step: 2,
        planId: null,
        quote: null,
        quoteRefresh: state.quoteRefresh + 1,
        notice: PLAN_UNAVAILABLE_MESSAGE,
      };
    case 'submitted':
      return { ...state, submitted: action.lead };
    case 'reset':
      return initialApplyState;
  }
}

const ApplyFormContext = createContext<{ state: ApplyState; dispatch: Dispatch<ApplyAction> } | null>(null);

export function ApplyFormProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(applyReducer, initialApplyState);
  return <ApplyFormContext value={{ state, dispatch }}>{children}</ApplyFormContext>;
}

export function useApplyForm() {
  const context = useContext(ApplyFormContext);
  if (!context) throw new Error('useApplyForm must be used inside <ApplyFormProvider>');
  return context;
}

/** What to show under a field: a server error first, otherwise the live error once the field was touched. */
export function visibleError(state: ApplyState, errors: DetailsErrors, field: DetailsField): string | undefined {
  return state.serverErrors[field] ?? (state.touched[field] ? errors[field] : undefined);
}
