import { Router, type Request, type Response } from 'express';
import { prenotazioniService } from './prenotazioni.service.js';
import { creaPrenotazioneSchema, creaOrdineSchema, creaOrdineOspiteSchema } from './prenotazioni.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { richiedeAuthCliente } from '../cliente-auth/cliente-auth.middleware.js';
import { NonAutorizzato } from '../../shared/errors.js';
import { limitePnr } from '../../shared/rateLimit.js';
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
    const prenotazione = await prenotazioniService.crea(req.body, req.cliente.sub, undefined, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json(prenotazione);
  },
  /** Il carrello — più articoli insieme, un'unica conferma/pagamento.
   *  Ogni articolo viene validato dal server esattamente come una
   *  prenotazione singola (stessa funzione, stesso controllo prezzo/
   *  posti) — il corpo della richiesta non passa mai un totale, il
   *  server lo ricalcola sempre da zero sommando ogni articolo. */
  async creaOrdine(req: Request, res: Response) {
    if (!req.cliente) throw new NonAutorizzato();
    const risultato = await prenotazioniService.creaOrdine(req.body.articoli, req.cliente.sub, req.body.bundleId, undefined, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json(risultato);
  },
  /** D1(b) — stesso ordine di creaOrdine sopra, ma per chi acquista
   *  SENZA essere loggato: risolve/crea l'utente "implicito" da
   *  email+dati forniti nel corpo, poi riusa esattamente la stessa
   *  prenotazioniService.creaOrdine() di sopra (stessa validazione
   *  prezzo/posti, stesso percorso — un solo posto dove quella logica
   *  vive, non una copia parallela). Dopo il successo, se l'account
   *  era nuovo (mai esistito prima), invita a impostare una password —
   *  ma un fallimento lì non deve mai far sparire un ordine già andato
   *  a buon fine, per questo è isolato nel proprio try/catch. */
  async creaOrdineOspite(req: Request, res: Response) {
    const { clienteAuthService } = await import('../cliente-auth/cliente-auth.service.js');
    const { email, nome, cognome, telefono, citta, dataNascita, articoli, bundleId } = req.body;
    const { utenteId, nuovo } = await clienteAuthService.trovaOCreaUtenteOspite({ email, nome, cognome, telefono, citta, dataNascita });

    const risultato = await prenotazioniService.creaOrdine(articoli, utenteId, bundleId, undefined, { ip: req.ip, userAgent: req.headers['user-agent'] });

    if (nuovo) {
      try {
        await clienteAuthService.invitaAImpostarePassword(utenteId);
      } catch (err) {
        console.error(`Invito a impostare password fallito per ${email} (ordine comunque creato):`, err);
      }
    }

    res.status(201).json(risultato);
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
  /** Solo dal gestionale (vedi la rotta): avvisa anche il cliente. */
  async cancella(req: Request, res: Response) {
    res.json(await prenotazioniService.cancellaDaAdmin(req.params.pnr, req.body?.motivo));
  },
  async eliminaDefinitivamente(req: Request, res: Response) {
    await prenotazioniService.eliminaDefinitivamente(req.params.pnr);
    res.status(204).send();
  },
  async differenzaSaldo(req: Request, res: Response) {
    res.json(await prenotazioniService.differenzaSaldo(req.params.pnr, String(req.query.email)));
  },
  async saldaResto(req: Request, res: Response) {
    res.json(await prenotazioniService.saldaResto(req.params.pnr, req.body.email, req.body?.couponCodice));
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
prenotazioniRouter.post('/ordine-ospite', limitePnr, valida(creaOrdineOspiteSchema), asyncHandler(prenotazioniController.creaOrdineOspite));
prenotazioniRouter.get('/by-email', limitePnr, valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.listByEmail));
prenotazioniRouter.get('/:pnr/dettaglio-cliente', limitePnr, valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.dettaglioPerCliente));
prenotazioniRouter.get('/:pnr/saldo', limitePnr, valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(prenotazioniController.differenzaSaldo));
prenotazioniRouter.post('/:pnr/salda', limitePnr, valida(z.object({ email: z.string().email(), couponCodice: z.string().optional() })), asyncHandler(prenotazioniController.saldaResto));

// Amministrazione: cancellazione vera di una prenotazione — protetta
// (era rimasta pubblica per errore: il cliente non può più cancellare
// da solo, deve passare da una richiesta di rimborso approvata).
// "motivo" facoltativo: resta scritto sulla prenotazione e finisce
// nell'email al cliente (se assente: "Cancellata dall'organizzazione").
prenotazioniRouter.post('/:pnr/cancella', richiedeAuth, richiedePermesso('prenotazioni.cancella'), valida(z.object({ motivo: z.string().max(500).optional() })), asyncHandler(prenotazioniController.cancella));

// Amministrazione: elimina DEFINITIVAMENTE una prenotazione già cancellata
// (per ripulire dati di test o duplicati) — non tocca quelle confermate.
prenotazioniRouter.delete('/:pnr', richiedeAuth, richiedePermesso('prenotazioni.cancella'), asyncHandler(prenotazioniController.eliminaDefinitivamente));
prenotazioniRouter.post('/:pnr/sollecito', richiedeAuth, richiedePermesso('prenotazioni.pagamenti'), asyncHandler(prenotazioniController.inviaSollecitoManuale));
prenotazioniRouter.post('/:pnr/rigenera-biglietto', richiedeAuth, richiedePermesso('prenotazioni.pagamenti'), asyncHandler(prenotazioniController.rigeneraBiglietto));

// Nota: in produzione qui andrebbe aggiunto un controllo che l'email nel
// body/query corrisponda al cliente autenticato (es. via magic-link/OTP),
// così un cliente non può cancellare o vedere prenotazioni altrui.
