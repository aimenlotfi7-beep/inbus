import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { tourLeaderAuthService } from './tour-leader-auth.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { limiteAutenticazione } from '../../shared/rateLimit.js';

export const tourLeaderAuthRouter = Router();

/** Login del tour leader — pubblico (è lui stesso a fornire le
 *  credenziali), non richiede nessuna autenticazione precedente. */
tourLeaderAuthRouter.post(
  '/login',
  limiteAutenticazione,
  valida(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const risultato = await tourLeaderAuthService.login(req.body.email, req.body.password);
    res.json(risultato);
  }),
);

tourLeaderAuthRouter.post(
  '/richiedi-reset',
  limiteAutenticazione,
  valida(z.object({ email: z.string().email() })),
  asyncHandler(async (req: Request, res: Response) => {
    await tourLeaderAuthService.richiediResetPassword(req.body.email);
    res.json({ ok: true });
  }),
);
tourLeaderAuthRouter.post(
  '/reset-password',
  limiteAutenticazione,
  valida(z.object({ token: z.string(), password: z.string().min(8, 'La password deve avere almeno 8 caratteri.') })),
  asyncHandler(async (req: Request, res: Response) => {
    await tourLeaderAuthService.confermaResetPassword(req.body.token, req.body.password);
    res.json({ ok: true });
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
