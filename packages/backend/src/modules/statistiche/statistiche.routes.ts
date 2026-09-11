import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ErroreApplicativo } from '../../shared/errors.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { costruisciPeriodo, type Periodo } from './periodo.js';
import { statisticheService } from './statistiche.service.js';

const filtroSchema = z.object({
  dal: z.string(),
  al: z.string(),
  confronto: z.enum(['anno', 'precedente', 'nessuno']).default('anno'),
});

function leggiPeriodo(req: Request): Periodo {
  const filtro = filtroSchema.safeParse(req.query);
  if (!filtro.success) {
    throw new ErroreApplicativo('Periodo non valido: servono le date di inizio e di fine (AAAA-MM-GG) e un confronto tra anno, precedente o nessuno.', 400, 'PERIODO_NON_VALIDO');
  }
  return costruisciPeriodo(filtro.data.dal, filtro.data.al, filtro.data.confronto);
}

export const statisticheRouter = Router();
statisticheRouter.use(richiedeAuth, richiedePermesso('statistiche.visualizza'));

statisticheRouter.get('/panoramica', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.panoramica(leggiPeriodo(req)));
}));
statisticheRouter.get('/da-guardare', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await statisticheService.daGuardare());
}));
statisticheRouter.get('/eventi', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.eventi(leggiPeriodo(req)));
}));
statisticheRouter.get('/eventi/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.evento(req.params.id));
}));
statisticheRouter.get('/vendite', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.vendite(leggiPeriodo(req)));
}));
statisticheRouter.get('/clienti', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.clienti(leggiPeriodo(req)));
}));
statisticheRouter.get('/costi', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.costi(leggiPeriodo(req)));
}));
