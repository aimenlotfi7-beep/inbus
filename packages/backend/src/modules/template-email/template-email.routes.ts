import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { templateEmailService } from './template-email.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const templateEmailRouter = Router();
templateEmailRouter.use(richiedeAuth, richiedePermesso('template-email.gestisci'));

templateEmailRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await templateEmailService.list());
}));

templateEmailRouter.put(
  '/:chiave',
  valida(z.object({ oggetto: z.string().min(1).optional(), corpo: z.string().min(1).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    await templateEmailService.aggiorna(req.params.chiave, req.body);
    res.json({ ok: true });
  }),
);
