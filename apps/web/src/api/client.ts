import type { FieldError } from '@goldloan/shared';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'We could not reach the server. Check your connection and try again.';

/** Any non-2xx response, parsed from the API error contract (CLAUDE.md §6). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error: { code: string; message: string; fields?: FieldError[]; details?: Record<string, unknown> };
}

function isErrorBody(body: unknown): body is ErrorBody {
  const error = (body as ErrorBody | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}

// Default: same origin, so the Vite dev proxy forwards /api to the API.
const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1`;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload as T;

  if (isErrorBody(payload)) {
    const { code, message, fields = [], details } = payload.error;
    throw new ApiError(response.status, code, message, fields, details);
  }
  throw new ApiError(response.status, 'UNKNOWN_ERROR', GENERIC_MESSAGE);
}
