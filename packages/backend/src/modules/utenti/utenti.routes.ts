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
  async datiPerCheckout(req: Request, res: Response) {
    const dati = await utentiService.datiPerCheckout(String(req.query.email));
    res.json(dati ?? null);
  },
};

export const utentiRouter = Router();
utentiRouter.get('/', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.list));

// Pubblico e intenzionalmente minimale: solo nome/cognome/telefono per
// precompilare il modulo "Richiedente" al checkout — dati che il cliente
// sta comunque per fornire lui stesso in quel momento, nessun dato
// sensibile aggiuntivo (non l'id utente, non lo storico prenotazioni).
utentiRouter.get('/dati-checkout', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(utentiController.datiPerCheckout));

utentiRouter.get('/:id', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.getById));
