import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { utentiService } from './utenti.service.js';
import { asyncHandler } from '../../shared/http.js';
import { valida } from '../../shared/validate.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const utentiController = {
  async list(_req: Request, res: Response) {
    res.json(await utentiService.list());
  },
  async getById(req: Request, res: Response) {
    const utente = await utentiService.getById(req.params.id);
    const prenotazioni = await utentiService.storicoPrenotazioni(utente.id);
    res.json({ ...utente, prenotazioni });
  },
  async getPreferenzePrivacy(req: Request, res: Response) {
    res.json(await utentiService.preferenzePrivacy(String(req.query.email)));
  },
  async setPreferenzePrivacy(req: Request, res: Response) {
    const { email, ...resto } = req.body;
    res.json(await utentiService.aggiornaPreferenzePrivacy(email, resto));
  },
};

export const utentiRouter = Router();
utentiRouter.get('/', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.list));

// Pubblico e intenzionalmente minimale: solo nome/cognome/telefono per
// precompilare il modulo "Richiedente" al checkout — dati che il cliente
// sta comunque per fornire lui stesso in quel momento, nessun dato
// sensibile aggiuntivo (non l'id utente, non lo storico prenotazioni).

// Pubbliche, con lo stesso principio di accesso via email già usato nel
// resto dell'area cliente (nessuna vera password oggi).
utentiRouter.get('/preferenze-privacy', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(utentiController.getPreferenzePrivacy));
utentiRouter.put('/preferenze-privacy', valida(z.object({
  email: z.string().email(),
  presaVisioneInformativa: z.boolean().optional(),
  consensoMarketing: z.boolean().optional(),
  consensoProfilazione: z.boolean().optional(),
})), asyncHandler(utentiController.setPreferenzePrivacy));

utentiRouter.get('/:id', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.getById));
