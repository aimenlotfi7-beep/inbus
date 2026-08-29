import { Router, type Request, type Response } from 'express';
import { offerteService } from './offerte.service.js';
import { creaOffertaSchema, aggiornaOffertaSchema } from './offerte.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const offerteController = {
  async listByEvento(req: Request, res: Response) {
    res.json(await offerteService.listByEvento(req.params.eventoId));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await offerteService.create(req.body));
  },
  async update(req: Request, res: Response) {
    res.json(await offerteService.update(req.params.id, req.body));
  },
  async remove(req: Request, res: Response) {
    await offerteService.remove(req.params.id);
    res.status(204).send();
  },
  async getBySlug(req: Request, res: Response) {
    const { offerta, evento } = await offerteService.getBySlugValida(req.params.slug);
    res.json({ offerta, evento });
  },
};

export const offerteRouter = Router();

// Pubblica: la pagina /offerta/:slug del sito la usa per mostrare
// l'evento con il prezzo dell'offerta.
offerteRouter.get('/pubblica/:slug', asyncHandler(offerteController.getBySlug));

// Amministrazione
offerteRouter.get('/evento/:eventoId', richiedeAuth, richiedePermesso('offerte.gestisci'), asyncHandler(offerteController.listByEvento));
offerteRouter.post('/', richiedeAuth, richiedePermesso('offerte.gestisci'), valida(creaOffertaSchema), asyncHandler(offerteController.create));
offerteRouter.put('/:id', richiedeAuth, richiedePermesso('offerte.gestisci'), valida(aggiornaOffertaSchema), asyncHandler(offerteController.update));
offerteRouter.delete('/:id', richiedeAuth, richiedePermesso('offerte.gestisci'), asyncHandler(offerteController.remove));
