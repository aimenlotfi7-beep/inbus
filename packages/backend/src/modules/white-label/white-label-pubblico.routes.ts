import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { whiteLabelService } from './white-label.service.js';
import { asyncHandler } from '../../shared/http.js';
import { db } from '../../db/client.js';
import { prenotazioni } from '../../db/schema.js';
import { creaPrenotazioneSchema, creaOrdineSchema } from '../prenotazioni/prenotazioni.dto.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { valida } from '../../shared/validate.js';
import { richiedeAuthCliente } from '../cliente-auth/cliente-auth.middleware.js';
import { commissioniService } from '../commissioni/commissioni.routes.js';
import { ErroreApplicativo } from '../../shared/errors.js';
import { WhiteLabelDisattivata } from './white-label.errors.js';

/** API pubblica del widget — nessuna autenticazione, chiamata
 *  direttamente dal sito dell'organizzatore. Restituisce SOLO ciò che
 *  serve per mostrare il widget: mai dati amministrativi, finanziari,
 *  o personali di nessun tipo. Separata di proposito dalle route admin
 *  (file diverso, prefisso diverso) — così è impossibile confondere
 *  "cosa vede il pubblico" con "cosa vede l'amministratore". */
export const whiteLabelPubblicoRouter = Router();

whiteLabelPubblicoRouter.get('/:publicWidgetId', asyncHandler(async (req: Request, res: Response) => {
  res.json(await whiteLabelService.getPubblicaDaWidgetId(req.params.publicWidgetId));
}));

/** Fermate + prezzi disponibili per l'evento di questa White Label —
 *  riusa integralmente eventiService.opzioniPartenza (stessa funzione
 *  del sito principale), solo dopo aver verificato che l'evento
 *  richiesto è davvero quello di questa White Label, non un altro. */
whiteLabelPubblicoRouter.get('/:publicWidgetId/opzioni-partenza', asyncHandler(async (req: Request, res: Response) => {
  const wl = await whiteLabelService.getPubblicaConIdInterno(req.params.publicWidgetId);
  const { eventiService } = await import('../eventi/eventi.service.js');
  // Widget di un bundle: le opzioni sono per UN evento del bundle alla
  // volta (?eventoId=…&servizioId=…) — e solo per eventi che ne fanno parte.
  if (wl.bundleId) {
    const eventoId = String(req.query.eventoId ?? '');
    const { bundleService } = await import('../bundle/bundle.service.js');
    const b = await bundleService.perAcquisto(wl.bundleId).catch(async () => ({ eventiIds: (await bundleService.dettaglio(wl.bundleId!)).eventi.map((e) => e.id) }));
    if (!b.eventiIds.includes(eventoId)) throw new ErroreApplicativo('Questo evento non fa parte del bundle.', 400, 'EVENT_NOT_AVAILABLE');
    res.json(await eventiService.opzioniPartenza(eventoId, req.query.servizioId ? String(req.query.servizioId) : undefined));
    return;
  }
  if (!wl.eventoId) throw new ErroreApplicativo('Widget non valido.', 400, 'WIDGET_NON_VALIDO');
  res.json(await eventiService.opzioniPartenza(wl.eventoId));
}));

/** Ordine BUNDLE dal widget — le righe passano dallo stesso creaOrdine
 *  del sito (regole del bundle verificate lì, lato server), con il
 *  canale WHITE_LABEL su ogni riga e lo snapshot della commissione per
 *  riga (sul netto sconto, come deciso). */
whiteLabelPubblicoRouter.post(
  '/:publicWidgetId/ordine',
  richiedeAuthCliente,
  valida(creaOrdineSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const wl = await whiteLabelService.getPubblicaConIdInterno(req.params.publicWidgetId);
    if (!wl.attiva) throw new WhiteLabelDisattivata();
    if (!wl.bundleId) throw new ErroreApplicativo('Questo widget non vende un bundle.', 400, 'WIDGET_NON_BUNDLE');
    const risultato = await prenotazioniService.creaOrdine(req.body.articoli, req.cliente!.sub, wl.bundleId, { canale: 'WHITE_LABEL', whiteLabelId: wl.id }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    for (const riga of risultato.prenotazioni) {
      const { percentuale, importo } = await commissioniService.calcolaSnapshot(wl.organizzatoreId, riga.totaleComplessivo);
      await db.update(prenotazioni).set({ commissionePercentualeSnapshot: String(percentuale), commissioneImportoSnapshot: String(importo) }).where(eq(prenotazioni.id, riga.id));
    }
    res.status(201).json(risultato);
  }),
);

/** Prenotazione vera dal widget — il cliente DEVE essere già
 *  autenticato con un vero account INBUS (richiedeAuthCliente, stesso
 *  meccanismo del sito principale, login incorporato nel widget stesso
 *  — mai un redirect). Riusa integralmente prenotazioniService.crea:
 *  stessa logica di blocco posti, stesso calcolo prezzo, stesso
 *  controllo coupon — il backend non si fida mai del prezzo che
 *  arriva dal widget, lo ricalcola sempre da zero come per il sito. */
whiteLabelPubblicoRouter.post(
  '/:publicWidgetId/prenota',
  richiedeAuthCliente,
  valida(creaPrenotazioneSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const wl = await whiteLabelService.getPubblicaConIdInterno(req.params.publicWidgetId);
    if (!wl.attiva) throw new WhiteLabelDisattivata();
    if (wl.bundleId) throw new ErroreApplicativo('Questo widget vende un bundle: usa /ordine.', 400, 'WIDGET_BUNDLE');
    if (req.body.eventoId !== wl.eventoId) {
      throw new ErroreApplicativo('Questo widget può prenotare solo il proprio evento.', 400, 'EVENT_NOT_AVAILABLE');
    }

    const nuova = await prenotazioniService.crea(req.body, req.cliente!.sub, { canale: 'WHITE_LABEL', whiteLabelId: wl.id }, { ip: req.ip, userAgent: req.headers['user-agent'] });

    // Snapshot commissione — resta un passaggio separato dopo (a
    // differenza di canale/whiteLabelId, spostati sopra: la commissione
    // serve solo per i conti dell'organizzatore, non per il biglietto,
    // quindi non c'è urgenza di averla prima che il biglietto parta).
    // Si scatta ORA, una volta sola: se in futuro la percentuale
    // dell'organizzatore cambia, questa vendita non cambia commissione
    // retroattivamente.
    const { percentuale, importo } = await commissioniService.calcolaSnapshot(wl.organizzatoreId, nuova.totaleComplessivo);
    await db.update(prenotazioni).set({
      commissionePercentualeSnapshot: String(percentuale),
      commissioneImportoSnapshot: String(importo),
    }).where(eq(prenotazioni.id, nuova.id));

    res.status(201).json(nuova);
  }),
);

