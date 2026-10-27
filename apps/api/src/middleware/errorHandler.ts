import { zodToFields } from '@goldloan/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, InternalError, ValidationError } from '../lib/errors';

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as BodyParserError).type === 'string' &&
    typeof (err as BodyParserError).status === 'number' &&
    (err as BodyParserError).status < 500
  );
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new ValidationError(zodToFields(err));
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large (max 100kb)');
    }
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  return new InternalError();
}

/** The only place that writes error responses. 5xx bodies never carry internals. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const appError = toAppError(err);
  if (appError.status >= 500) req.log.error({ err }, 'Request failed');

  res.status(appError.status).json(appError.toBody());
};
