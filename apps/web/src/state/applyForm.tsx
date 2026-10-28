import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { EMPTY_DETAILS, type DetailsDraft, type DetailsField } from './details';

export type Step = 1 | 2 | 3;

/** All Apply-flow state lives here so the three steps share one source of truth. */
export interface ApplyState {
  step: Step;
  details: DetailsDraft;
  /** Fields that have been blurred at least once: their errors are shown from then on. */
  touched: Partial<Record<DetailsField, true>>;
  planId: string | null;
}

export type ApplyAction =
  | { [F in DetailsField]: { type: 'setField'; field: F; value: DetailsDraft[F] } }[DetailsField]
  | { type: 'touch'; field: DetailsField }
  | { type: 'goTo'; step: Step }
  | { type: 'selectPlan'; planId: string };

export const initialApplyState: ApplyState = { step: 1, details: EMPTY_DETAILS, touched: {}, planId: null };

export function applyReducer(state: ApplyState, action: ApplyAction): ApplyState {
  switch (action.type) {
    case 'setField':
      return { ...state, details: { ...state.details, [action.field]: action.value } };
    case 'touch':
      return state.touched[action.field] ? state : { ...state, touched: { ...state.touched, [action.field]: true } };
    case 'goTo':
      return { ...state, step: action.step };
    case 'selectPlan':
      return { ...state, planId: action.planId };
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
