import { Router, type Request, type Response } from 'express';
import { prenotazioniService } from './prenotazioni.service.js';
import { creaPrenotazioneSchema, creaOrdineSchema } from './prenotazioni.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { richiedeAuthCliente } from '../cliente-auth/cliente-auth.middleware.js';
import { NonAutorizzato } from '../../shared/errors.js';
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
    if (!req.cliente) throw new NonAutorizzato();
    const prenotazione = await prenotazioniService.crea(req.body, req.cliente.sub);
    res.status(201).json(prenotazione);
  },
  /** Il carrello — più articoli insieme, un'unica conferma/pagamento.
   *  Ogni articolo viene validato dal server esattamente come una
   *  prenotazione singola (stessa funzione, stesso controllo prezzo/
   *  posti) — il corpo della richiesta non passa mai un totale, il
   *  server lo ricalcola sempre da zero sommando ogni articolo. */
  async creaOrdine(req: Request, res: Response) {
    if (!req.cliente) throw new NonAutorizzato();
    const risultato = await prenotazioniService.creaOrdine(req.body.articoli, req.cliente.sub);
    res.status(201).json(risultato);
  },
  async getByPnr(req: Request, res: Response) {
    res.json(await prenotazioniService.getByPnr(req.params.pnr));
  },
  async dettaglioPerCliente(req: Request, res: Response) {
    res.json(await prenotazioniService.dettaglioPerCliente(req.params.pnr, String(req.query.email)));
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
  async differenzaSaldo(req: Request, res: Response) {
    res.json(await prenotazioniService.differenzaSaldo(req.params.pnr));
  },
  async saldaResto(req: Request, res: Response) {
    res.json(await prenotazioniService.saldaResto(req.params.pnr, req.body?.couponCodice));
  },
  async inviaSollecitoManuale(req: Request, res: Response) {
    res.json(await prenotazioniService.inviaSollecitoManuale(req.params.pnr));
  },
  async rigeneraBiglietto(req: Request, res: Response) {
    const { ticketService } = await import('../ticket/ticket.service.js');
    await ticketService.emetti(req.params.pnr);
    res.json({ ok: true });
  },
};

export const prenotazioniRouter = Router();

// Amministrazione: elenco completo per Transazioni/Pagamenti nel gestionale
prenotazioniRouter.get('/', richiedeAuth, richiedePermesso('prenotazioni.visualizza'), asyncHandler(prenotazioniController.listAll));
// IMPORTANTE: va registrata PRIMA di GET '/:pnr', altrimenti Express la
// interpreterebbe come una richiesta per una prenotazione con pnr "eventi".
prenotazioniRouter.get('/eventi', richiedeAuth, richiedePermesso('prenotazioni.visualizza'), asyncHandler(prenotazioniController.eventiConPrenotazioni));

// Pubbliche: il checkout del sito e l'area cliente non richiedono login admin
prenotazioniRouter.post('/', richiedeAuthCliente, valida(creaPrenotazioneSchema), asyncHandler(prenotazioniController.crea));
prenotazioniRouter.post('/ordine', richiedeAuthCliente, valida(creaOrdineSchema), asyncHandler(prenotazioniController.creaOrdine));
prenotazioniRouter.get('/by-email', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.listByEmail));
prenotazioniRouter.get('/:pnr/dettaglio-cliente', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.dettaglioPerCliente));
prenotazioniRouter.get('/:pnr', asyncHandler(prenotazioniController.getByPnr));
prenotazioniRouter.get('/:pnr/saldo', asyncHandler(prenotazioniController.differenzaSaldo));
prenotazioniRouter.post('/:pnr/salda', asyncHandler(prenotazioniController.saldaResto));

// Amministrazione: cancellazione vera di una prenotazione — protetta
// (era rimasta pubblica per errore: il cliente non può più cancellare
// da solo, deve passare da una richiesta di rimborso approvata).
prenotazioniRouter.post('/:pnr/cancella', richiedeAuth, richiedePermesso('prenotazioni.cancella'), asyncHandler(prenotazioniController.cancella));

// Amministrazione: elimina DEFINITIVAMENTE una prenotazione già cancellata
// (per ripulire dati di test o duplicati) — non tocca quelle confermate.
prenotazioniRouter.delete('/:pnr', richiedeAuth, richiedePermesso('prenotazioni.cancella'), asyncHandler(prenotazioniController.eliminaDefinitivamente));
prenotazioniRouter.post('/:pnr/sollecito', richiedeAuth, richiedePermesso('prenotazioni.pagamenti'), asyncHandler(prenotazioniController.inviaSollecitoManuale));
prenotazioniRouter.post('/:pnr/rigenera-biglietto', richiedeAuth, richiedePermesso('prenotazioni.pagamenti'), asyncHandler(prenotazioniController.rigeneraBiglietto));

// Nota: in produzione qui andrebbe aggiunto un controllo che l'email nel
// body/query corrisponda al cliente autenticato (es. via magic-link/OTP),
// così un cliente non può cancellare o vedere prenotazioni altrui.
