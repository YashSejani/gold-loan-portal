import { Router } from 'express';
import * as schemeService from '../services/schemeService';

export const schemesRouter = Router();

schemesRouter.get('/', async (_req, res) => {
  const schemes = await schemeService.listActive();
  res.json({ data: schemes.map(schemeService.toSchemeDto) });
});
