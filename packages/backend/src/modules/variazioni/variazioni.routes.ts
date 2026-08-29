import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { listaVariazioni, infoRispostaVariazione, rispondiVariazione } from './variazioni.service.js';

export const variazioniRouter = Router();

// Admin — elenco per il gestionale (sezione Customer Care).
variazioniRouter.get('/', richiedeAuth, richiedePermesso('prenotazioni.pagamenti'), asyncHandler(async (_req: Request, res: Response) => {
  res.json(await listaVariazioni());
}));

// Pubbliche — la pagina "/variazione/:token" che il cliente apre dalla
// mail, nessun login richiesto (il token stesso fa da autenticazione,
// come già per "/finalizza/:token" della lista d'attesa).
export const variazioniRispostePubblicheRouter = Router();

variazioniRispostePubblicheRouter.get('/:token', asyncHandler(async (req: Request, res: Response) => {
  res.json(await infoRispostaVariazione(req.params.token));
}));

const rispostaSchema = z.object({ risposta: z.enum(['ACCETTATA', 'RIMBORSO_RICHIESTO']) });

variazioniRispostePubblicheRouter.post('/:token/rispondi', valida(rispostaSchema), asyncHandler(async (req: Request, res: Response) => {
  await rispondiVariazione(req.params.token, req.body.risposta);
  res.json({ ok: true });
}));
