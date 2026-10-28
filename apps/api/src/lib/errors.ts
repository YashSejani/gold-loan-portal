import type { FieldError } from '@goldloan/shared';

// Error contract (CLAUDE.md §6): every non-2xx body is { error: { code, message, fields, details? } }.
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'PLAN_NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'DUPLICATE_APPLICATION'
  | 'QUOTE_CHANGED'
  | 'GOLD_RATE_UNAVAILABLE'
  | 'AGENT_UNAVAILABLE'
  | 'PENDING_NOT_FOUND'
  | 'INTERNAL_ERROR';

export type ErrorDetails = Record<string, unknown>;

export interface ErrorBody {
  error: { code: ErrorCode; message: string; fields: FieldError[]; details?: ErrorDetails };
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields: FieldError[] = [],
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody(): ErrorBody {
    const { code, message, fields, details } = this;
    return { error: details ? { code, message, fields, details } : { code, message, fields } };
  }
}

export class ValidationError extends AppError {
  constructor(fields: FieldError[], message = 'Some fields are invalid') {
    super(400, 'VALIDATION_ERROR', message, fields);
  }
}

export class NotFoundError extends AppError {
  constructor(code: 'PLAN_NOT_FOUND' | 'ROUTE_NOT_FOUND' | 'PENDING_NOT_FOUND', message: string, fields: FieldError[] = []) {
    super(404, code, message, fields);
  }
}

export class ConflictError extends AppError {
  constructor(
    code: 'DUPLICATE_APPLICATION' | 'QUOTE_CHANGED',
    message: string,
    fields: FieldError[] = [],
    details?: ErrorDetails,
  ) {
    super(409, code, message, fields, details);
  }
}

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export class InternalError extends AppError {
  constructor() {
    super(500, 'INTERNAL_ERROR', INTERNAL_ERROR_MESSAGE);
  }
}
