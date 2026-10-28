import { Router } from 'express';
import * as leadService from '../services/leadService';

export const leadsRouter = Router();

// leadService.create validates the body itself, so the §4.4 order holds for every caller.
leadsRouter.post('/', async (req, res) => {
  res.status(201).json({ data: await leadService.create(req.body) });
});

leadsRouter.get('/', async (req, res) => {
  res.json(await leadService.list(req.query));
});
