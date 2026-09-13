import { Router, type Request, type Response } from 'express';
import { utentiService } from './utenti.service.js';
import { asyncHandler } from '../../shared/http.js';
import { senzaSegreti } from '../../shared/segreti.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const utentiController = {
  // Clienti nel gestionale: mai hash della password né token di reset o di
  // verifica email (con il token di reset si prendeva l'account del cliente).
  async list(_req: Request, res: Response) {
    res.json((await utentiService.list()).map(senzaSegreti));
  },
  async getById(req: Request, res: Response) {
    const utente = await utentiService.getById(req.params.id);
    const prenotazioni = await utentiService.storicoPrenotazioni(utente.id);
    res.json({ ...senzaSegreti(utente), prenotazioni });
  },
};

export const utentiRouter = Router();
utentiRouter.get('/', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.list));

// Preferenze privacy del cliente: /api/cliente-auth/me/preferenze-privacy,
// con l'account. Prima si leggevano e cambiavano i consensi di qualsiasi email.

utentiRouter.get('/:id', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.getById));
