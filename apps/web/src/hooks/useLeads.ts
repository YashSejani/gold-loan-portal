import type { LeadDto } from '@goldloan/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getLeads } from '../api/endpoints';

interface LeadsState {
  status: 'loading' | 'success' | 'error';
  leads: LeadDto[];
  total: number;
  error: string | null;
}

/** GET /leads for the given plan filter. Changing the filter aborts the previous request. */
export function useLeads(planId: string | null) {
  const [state, setState] = useState<LeadsState>({ status: 'loading', leads: [], total: 0, error: null });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    getLeads(planId, controller.signal).then(
      ({ data, meta }) => {
        if (!controller.signal.aborted) setState({ status: 'success', leads: data, total: meta.total, error: null });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        setState((previous) => ({ ...previous, status: 'error', error }));
      },
    );
    return () => controller.abort();
  }, [planId, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  return { ...state, reload };
}
