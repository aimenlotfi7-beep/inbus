import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { whiteLabelService } from './white-label.service.js';
import { asyncHandler } from '../../shared/http.js';
import { db } from '../../db/client.js';
import { prenotazioni } from '../../db/schema.js';
import { creaPrenotazioneSchema } from '../prenotazioni/prenotazioni.dto.js';
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
  res.json(await eventiService.opzioniPartenza(wl.eventoId));
}));

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
    if (req.body.eventoId !== wl.eventoId) {
      throw new ErroreApplicativo('Questo widget può prenotare solo il proprio evento.', 400, 'EVENT_NOT_AVAILABLE');
    }

    const nuova = await prenotazioniService.crea(req.body, req.cliente!.sub, { canale: 'WHITE_LABEL', whiteLabelId: wl.id });

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

