import { Router, type Request, type Response } from 'express';
import { utentiService } from './utenti.service.js';
import { asyncHandler } from '../../shared/http.js';
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
};

export const utentiRouter = Router();
utentiRouter.get('/', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.list));
utentiRouter.get('/:id', richiedeAuth, richiedePermesso('utenti.visualizza'), asyncHandler(utentiController.getById));
