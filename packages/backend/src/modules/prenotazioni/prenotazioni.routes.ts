import { Router, type Request, type Response } from 'express';
import { prenotazioniService } from './prenotazioni.service.js';
import { creaPrenotazioneSchema } from './prenotazioni.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';
import { z } from 'zod';

export const prenotazioniController = {
  async listAll(_req: Request, res: Response) {
    res.json(await prenotazioniService.listAll());
  },
  async crea(req: Request, res: Response) {
    const prenotazione = await prenotazioniService.crea(req.body);
    res.status(201).json(prenotazione);
  },
  async getByPnr(req: Request, res: Response) {
    res.json(await prenotazioniService.getByPnr(req.params.pnr));
  },
  async listByEmail(req: Request, res: Response) {
    res.json(await prenotazioniService.listByEmail(String(req.query.email)));
  },
  async cancella(req: Request, res: Response) {
    res.json(await prenotazioniService.cancella(req.params.pnr));
  },
  async richiediRimborso(req: Request, res: Response) {
    res.json(await prenotazioniService.richiediRimborso(req.params.pnr));
  },
};

export const prenotazioniRouter = Router();

// Amministrazione: elenco completo per Transazioni/Pagamenti nel gestionale
prenotazioniRouter.get('/', richiedeAuth, richiedeRuolo('AMMINISTRATORE', 'OPERATORE', 'COLLABORATORE'), asyncHandler(prenotazioniController.listAll));

// Pubbliche: il checkout del sito e l'area cliente non richiedono login admin
prenotazioniRouter.post('/', valida(creaPrenotazioneSchema), asyncHandler(prenotazioniController.crea));
prenotazioniRouter.get('/by-email', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.listByEmail));
prenotazioniRouter.get('/:pnr', asyncHandler(prenotazioniController.getByPnr));
prenotazioniRouter.post('/:pnr/cancella', asyncHandler(prenotazioniController.cancella));
prenotazioniRouter.post('/:pnr/richiedi-rimborso', asyncHandler(prenotazioniController.richiediRimborso));

// Nota: in produzione qui andrebbe aggiunto un controllo che l'email nel
// body/query corrisponda al cliente autenticato (es. via magic-link/OTP),
// così un cliente non può cancellare o vedere prenotazioni altrui.
