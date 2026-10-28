import { QuoteRequestSchema, type QuoteDto, type QuoteRequest } from '@goldloan/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { postQuote } from '../api/endpoints';

export const QUOTE_DEBOUNCE_MS = 300;

export type QuoteStatus = 'idle' | 'loading' | 'success' | 'error';

export interface DebouncedQuote {
  status: QuoteStatus;
  /** Latest successful quote; kept while a newer one loads so the UI can dim it instead of flashing. */
  quote: QuoteDto | null;
  error: ApiError | null;
  retry: () => void;
}

/**
 * Live quote for the given inputs: waits 300 ms after the last change, aborts the previous request,
 * and ignores any response that is not for the latest inputs. Invalid inputs → no request ("idle").
 */
export function useDebouncedQuote(net: unknown, gross: unknown, karat: unknown, refreshKey = 0): DebouncedQuote {
  const parsed = QuoteRequestSchema.safeParse({ netWeightGrams: net, grossWeightGrams: gross, karat });
  // A string key so the effect re-runs on value changes, not on every new object.
  const requestKey = parsed.success ? JSON.stringify(parsed.data) : null;

  const [state, setState] = useState<Omit<DebouncedQuote, 'retry'>>({ status: 'idle', quote: null, error: null });
  const [retryCount, setRetryCount] = useState(0);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    if (requestKey === null) {
      setState((previous) => ({ ...previous, status: 'idle', error: null }));
      return;
    }

    const request = JSON.parse(requestKey) as QuoteRequest;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, status: 'loading', error: null }));

    const timer = setTimeout(() => {
      postQuote(request, controller.signal).then(
        (quote) => {
          if (requestId === latestRequestId.current) setState({ status: 'success', quote, error: null });
        },
        (err: unknown) => {
          if (requestId !== latestRequestId.current || controller.signal.aborted) return;
          const error = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN_ERROR', 'Something went wrong. Please try again.');
          setState((previous) => ({ ...previous, status: 'error', error }));
        },
      );
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, refreshKey, retryCount]);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  return { ...state, retry };
}
