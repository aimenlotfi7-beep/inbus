import { Router, type Request, type Response } from 'express';
import { whiteLabelService } from './white-label.service.js';
import { asyncHandler } from '../../shared/http.js';

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
