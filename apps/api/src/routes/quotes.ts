import { QuoteRequestSchema, type QuoteRequest } from '@goldloan/shared';
import { Router } from 'express';
import { validateBody } from '../middleware/validate';
import * as quoteService from '../services/quoteService';

export const quotesRouter = Router();

quotesRouter.post('/', validateBody(QuoteRequestSchema), async (req, res) => {
  const quote = await quoteService.calculate(req.body as QuoteRequest);
  res.json({ data: quoteService.toQuoteDto(quote) });
});
