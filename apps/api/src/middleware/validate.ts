import { zodToFields } from '@goldloan/shared';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors';

/** Parses req.body with a shared schema and replaces it with the parsed (stripped, coerced) data. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) throw new ValidationError(zodToFields(result.error));
    req.body = result.data;
    next();
  };
}
