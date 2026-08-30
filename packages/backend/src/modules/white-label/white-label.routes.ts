import { Router, type Request, type Response } from 'express';
import { whiteLabelService } from './white-label.service.js';
import { creaWhiteLabelSchema, aggiornaWhiteLabelSchema } from './white-label.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

/** Solo amministrazione — creare/modificare/attivare/disattivare una
 *  White Label è sempre e solo una cosa che fa INBUS, mai
 *  l'organizzatore (l'organizzatore non deve poter modificare nulla
 *  della grafica o della configurazione). */
export const whiteLabelRouter = Router();
whiteLabelRouter.use(richiedeAuth);

whiteLabelRouter.get('/', richiedePermesso('white-label.visualizza'), asyncHandler(async (_req: Request, res: Response) => {
  res.json(await whiteLabelService.list());
}));
whiteLabelRouter.get('/:id', richiedePermesso('white-label.visualizza'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await whiteLabelService.getById(req.params.id));
}));
whiteLabelRouter.post('/', richiedePermesso('white-label.gestisci'), valida(creaWhiteLabelSchema), asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await whiteLabelService.create(req.body));
}));
whiteLabelRouter.put('/:id', richiedePermesso('white-label.gestisci'), valida(aggiornaWhiteLabelSchema), asyncHandler(async (req: Request, res: Response) => {
  res.json(await whiteLabelService.update(req.params.id, req.body));
}));
whiteLabelRouter.post('/:id/rigenera-widget-id', richiedePermesso('white-label.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  res.json(await whiteLabelService.rigeneraPublicWidgetId(req.params.id));
}));
whiteLabelRouter.delete('/:id', richiedePermesso('white-label.gestisci'), asyncHandler(async (req: Request, res: Response) => {
  await whiteLabelService.remove(req.params.id);
  res.status(204).send();
}));
