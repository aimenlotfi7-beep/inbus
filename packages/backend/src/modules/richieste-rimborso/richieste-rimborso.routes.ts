import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { richiesteRimborsoService } from './richieste-rimborso.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const richiesteRimborsoRouter = Router();

/** Pubblica: è il cliente stesso a inviarla, dalla sua area personale. */
richiesteRimborsoRouter.post(
  '/',
  valida(z.object({ pnr: z.string().min(1), email: z.string().email(), motivo: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const nuova = await richiesteRimborsoService.richiedi(req.body.pnr, req.body.email, req.body.motivo);
    res.json(nuova);
  }),
);

richiesteRimborsoRouter.get(
  '/conta-in-attesa',
  richiedeAuth,
  richiedePermesso('prenotazioni.pagamenti'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ conteggio: await richiesteRimborsoService.contaInAttesa() });
  }),
);

richiesteRimborsoRouter.get(
  '/',
  richiedeAuth,
  richiedePermesso('prenotazioni.pagamenti'),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await richiesteRimborsoService.list());
  }),
);

richiesteRimborsoRouter.post(
  '/:id/approva',
  richiedeAuth,
  richiedePermesso('prenotazioni.pagamenti'),
  valida(z.object({ noteAdmin: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    await richiesteRimborsoService.approva(req.params.id, req.body.noteAdmin);
    res.json({ ok: true });
  }),
);

richiesteRimborsoRouter.post(
  '/:id/rifiuta',
  richiedeAuth,
  richiedePermesso('prenotazioni.pagamenti'),
  valida(z.object({ noteAdmin: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    await richiesteRimborsoService.rifiuta(req.params.id, req.body.noteAdmin);
    res.json({ ok: true });
  }),
);
