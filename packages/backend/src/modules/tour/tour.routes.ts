import { Router, type Request, type Response } from 'express';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { creaTourSchema, aggiornaTourSchema } from './tour.dto.js';
import { tourService } from './tour.service.js';

export const tourRouter = Router();

// Pubblica — prima di richiedeAuth.
tourRouter.get('/pubblico', asyncHandler(async (_req: Request, res: Response) => res.json(await tourService.listaPubblica())));
tourRouter.get('/pubblico/:slug', asyncHandler(async (req: Request, res: Response) => res.json(await tourService.dettaglioPubblico(req.params.slug))));

tourRouter.use(richiedeAuth);
tourRouter.get('/', richiedePermesso('tour.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await tourService.list())));
tourRouter.get('/:id', richiedePermesso('tour.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await tourService.dettaglio(req.params.id))));
tourRouter.post('/', richiedePermesso('tour.gestisci'), valida(creaTourSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await tourService.create(req.body))));
tourRouter.put('/:id', richiedePermesso('tour.gestisci'), valida(aggiornaTourSchema), asyncHandler(async (req: Request, res: Response) => res.json(await tourService.update(req.params.id, req.body))));
tourRouter.delete('/:id', richiedePermesso('tour.elimina'), asyncHandler(async (req: Request, res: Response) => { await tourService.remove(req.params.id); res.status(204).send(); }));
