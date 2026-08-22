import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { tourLeaderAuthService } from './tour-leader-auth.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const tourLeaderAuthRouter = Router();

/** Login del tour leader — pubblico (è lui stesso a fornire le
 *  credenziali), non richiede nessuna autenticazione precedente. */
tourLeaderAuthRouter.post(
  '/login',
  valida(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const risultato = await tourLeaderAuthService.login(req.body.email, req.body.password);
    res.json(risultato);
  }),
);

/** Attiva/rigenera le credenziali di un tour leader — SOLO
 *  amministratori con permesso di gestione tour leader (usa
 *  l'autenticazione admin, non quella tour leader). */
tourLeaderAuthRouter.post(
  '/:tourLeaderId/attiva-accesso',
  richiedeAuth,
  richiedePermesso('tourleader.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    const risultato = await tourLeaderAuthService.attivaAccesso(req.params.tourLeaderId);
    res.json(risultato);
  }),
);
