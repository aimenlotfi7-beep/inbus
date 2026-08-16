import { Router, type Request, type Response } from 'express';
import { prenotazioniService } from './prenotazioni.service.js';
import { creaPrenotazioneSchema } from './prenotazioni.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { z } from 'zod';

export const prenotazioniController = {
  async listAll(req: Request, res: Response) {
    const { eventoId, stato, ricerca } = req.query;
    res.json(await prenotazioniService.listAll({
      eventoId: typeof eventoId === 'string' ? eventoId : undefined,
      stato: stato === 'CONFERMATA' || stato === 'CANCELLATA' ? stato : undefined,
      ricerca: typeof ricerca === 'string' ? ricerca : undefined,
    }));
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
  async eventiConPrenotazioni(_req: Request, res: Response) {
    res.json(await prenotazioniService.eventiConPrenotazioni());
  },
  async cancella(req: Request, res: Response) {
    res.json(await prenotazioniService.cancella(req.params.pnr));
  },
  async eliminaDefinitivamente(req: Request, res: Response) {
    await prenotazioniService.eliminaDefinitivamente(req.params.pnr);
    res.status(204).send();
  },
  async richiediRimborso(req: Request, res: Response) {
    res.json(await prenotazioniService.richiediRimborso(req.params.pnr));
  },
  async differenzaSaldo(req: Request, res: Response) {
    res.json(await prenotazioniService.differenzaSaldo(req.params.pnr));
  },
  async saldaResto(req: Request, res: Response) {
    res.json(await prenotazioniService.saldaResto(req.params.pnr));
  },
};

export const prenotazioniRouter = Router();

// Amministrazione: elenco completo per Transazioni/Pagamenti nel gestionale
prenotazioniRouter.get('/', richiedeAuth, richiedePermesso('prenotazioni.visualizza'), asyncHandler(prenotazioniController.listAll));
// IMPORTANTE: va registrata PRIMA di GET '/:pnr', altrimenti Express la
// interpreterebbe come una richiesta per una prenotazione con pnr "eventi".
prenotazioniRouter.get('/eventi', richiedeAuth, richiedePermesso('prenotazioni.visualizza'), asyncHandler(prenotazioniController.eventiConPrenotazioni));

// Pubbliche: il checkout del sito e l'area cliente non richiedono login admin
prenotazioniRouter.post('/', valida(creaPrenotazioneSchema), asyncHandler(prenotazioniController.crea));
prenotazioniRouter.get('/by-email', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.listByEmail));
prenotazioniRouter.get('/:pnr', asyncHandler(prenotazioniController.getByPnr));
prenotazioniRouter.post('/:pnr/cancella', asyncHandler(prenotazioniController.cancella));
prenotazioniRouter.post('/:pnr/richiedi-rimborso', asyncHandler(prenotazioniController.richiediRimborso));
prenotazioniRouter.get('/:pnr/saldo', asyncHandler(prenotazioniController.differenzaSaldo));
prenotazioniRouter.post('/:pnr/salda', asyncHandler(prenotazioniController.saldaResto));

// Amministrazione: elimina DEFINITIVAMENTE una prenotazione già cancellata
// (per ripulire dati di test o duplicati) — non tocca quelle confermate.
prenotazioniRouter.delete('/:pnr', richiedeAuth, richiedePermesso('prenotazioni.cancella'), asyncHandler(prenotazioniController.eliminaDefinitivamente));

// Nota: in produzione qui andrebbe aggiunto un controllo che l'email nel
// body/query corrisponda al cliente autenticato (es. via magic-link/OTP),
// così un cliente non può cancellare o vedere prenotazioni altrui.
