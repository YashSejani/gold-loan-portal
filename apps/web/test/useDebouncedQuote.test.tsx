import type { QuoteRequest } from '@goldloan/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedQuote } from '../src/hooks/useDebouncedQuote';
import { json, quoteFor } from './helpers/api';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useDebouncedQuote', () => {
  it('calls the API once, 300 ms after the last change, with the latest values', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      json(200, { data: quoteFor(JSON.parse(String(init.body))) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ net }) => useDebouncedQuote(net, 50, 22), {
      initialProps: { net: 4 as number | undefined },
    });
    for (const net of [45, 45.5, 45]) {
      await act(() => vi.advanceTimersByTimeAsync(100));
      rerender({ net });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('loading');

    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body))).toEqual({
      netWeightGrams: 45,
      grossWeightGrams: 50,
      karat: 22,
    });
    expect(result.current.status).toBe('success');
    expect(result.current.quote?.input.netWeightGrams).toBe(45);
  });

  it('does not call the API while inputs are invalid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useDebouncedQuote(52, 50, 22)); // net > gross
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('aborts the stale request and ignores its late response', async () => {
    const pending: Array<{ input: QuoteRequest; resolve: (r: Response) => void; signal: AbortSignal }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve) => {
            pending.push({ input: JSON.parse(String(init.body)), resolve, signal: init.signal! });
          }),
      ),
    );

    const { result, rerender } = renderHook(({ net }) => useDebouncedQuote(net, 50, 22), {
      initialProps: { net: 10 },
    });
    await act(() => vi.advanceTimersByTimeAsync(300)); // request A (net 10) in flight
    rerender({ net: 20 });
    await act(() => vi.advanceTimersByTimeAsync(300)); // request B (net 20) in flight

    expect(pending).toHaveLength(2);
    expect(pending[0]!.signal.aborted).toBe(true);

    // B answers first, then the stale A arrives late.
    await act(async () => pending[1]!.resolve(json(200, { data: quoteFor(pending[1]!.input) })));
    await act(async () => pending[0]!.resolve(json(200, { data: quoteFor(pending[0]!.input) })));

    expect(result.current.status).toBe('success');
    expect(result.current.quote?.input.netWeightGrams).toBe(20);
  });

  it('exposes API errors and retries on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, { error: { code: 'GOLD_RATE_UNAVAILABLE', message: 'Rate down', fields: [] } }))
      .mockImplementation(async (_url: string, init: RequestInit) =>
        json(200, { data: quoteFor(JSON.parse(String(init.body))) }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDebouncedQuote(45, 50, 22));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('Rate down');

    act(() => result.current.retry());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.status).toBe('success');
  });
});
