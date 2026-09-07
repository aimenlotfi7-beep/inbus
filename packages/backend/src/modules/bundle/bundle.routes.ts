import { Router, type Request, type Response } from 'express';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { creaBundleSchema, aggiornaBundleSchema } from './bundle.dto.js';
import { bundleService } from './bundle.service.js';

export const bundleRouter = Router();

// Pubbliche — prima di richiedeAuth.
bundleRouter.get('/pubblico', asyncHandler(async (_req: Request, res: Response) => res.json(await bundleService.listaPubblica())));
bundleRouter.get('/pubblico/:slug', asyncHandler(async (req: Request, res: Response) => res.json(await bundleService.dettaglioPubblico(req.params.slug))));

bundleRouter.use(richiedeAuth);
bundleRouter.get('/', richiedePermesso('bundle.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await bundleService.list())));
bundleRouter.get('/:id', richiedePermesso('bundle.visualizza'), asyncHandler(async (req: Request, res: Response) => res.json(await bundleService.dettaglio(req.params.id))));
bundleRouter.post('/', richiedePermesso('bundle.gestisci'), valida(creaBundleSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await bundleService.create(req.body))));
bundleRouter.put('/:id', richiedePermesso('bundle.gestisci'), valida(aggiornaBundleSchema), asyncHandler(async (req: Request, res: Response) => res.json(await bundleService.update(req.params.id, req.body))));
bundleRouter.delete('/:id', richiedePermesso('bundle.elimina'), asyncHandler(async (req: Request, res: Response) => { await bundleService.remove(req.params.id); res.status(204).send(); }));
