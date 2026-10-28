import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../src/api/client';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('returns the parsed body on 2xx and sends JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/quotes', { method: 'POST', body: { karat: 22 } })).resolves.toEqual({ data: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/quotes');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"karat":22}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with the error contract on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: 'DUPLICATE_APPLICATION',
            message: 'Already applied',
            fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
            details: { existingApplicationId: 'GL-1042' },
          },
        }),
      ),
    );

    const error = await apiFetch('/leads', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'DUPLICATE_APPLICATION',
      message: 'Already applied',
      fields: [{ field: 'mobileNumber', message: 'Already applied in the last 7 days' }],
      details: { existingApplicationId: 'GL-1042' },
    });
  });

  it('turns a non-contract error body (e.g. a proxy 502 page) into a generic ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(apiFetch('/quotes')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      message: 'Something went wrong. Please try again.',
      fields: [],
    });
  });

  it('turns a network failure into a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/quotes')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'We could not reach the server. Check your connection and try again.',
    });
  });

  it('lets an aborted request reject with the AbortError (so callers can ignore it)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(apiFetch('/quotes')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
