import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ErroreApplicativo } from '../../shared/errors.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import type { FiltroEventi } from './filtro-eventi.js';
import { costruisciPeriodo, type Periodo } from './periodo.js';
import { simulazioneBusService } from './simulazione-bus.service.js';
import { statisticheService } from './statistiche.service.js';

const filtroSchema = z.object({
  dal: z.string(),
  al: z.string(),
  confronto: z.enum(['anno', 'precedente', 'nessuno']).default('anno'),
});

/** I filtri sugli eventi: tutti facoltativi, vuoti = nessun filtro. */
const voce = z.string().trim().max(200).optional().transform((v) => v || undefined);
const filtroEventiSchema = z.object({ categoria: voce, genere: voce, citta: voce, tourId: voce, eventoId: voce });

function leggiPeriodo(req: Request): Periodo {
  const filtro = filtroSchema.safeParse(req.query);
  if (!filtro.success) {
    throw new ErroreApplicativo('Periodo non valido: servono le date di inizio e di fine (AAAA-MM-GG) e un confronto tra anno, precedente o nessuno.', 400, 'PERIODO_NON_VALIDO');
  }
  return costruisciPeriodo(filtro.data.dal, filtro.data.al, filtro.data.confronto);
}

function leggiFiltroEventi(req: Request): FiltroEventi {
  const filtro = filtroEventiSchema.safeParse(req.query);
  if (!filtro.success) throw new ErroreApplicativo('Filtri non validi: ogni voce può avere al massimo 200 caratteri.', 400, 'FILTRI_NON_VALIDI');
  return filtro.data;
}

export const statisticheRouter = Router();
statisticheRouter.use(richiedeAuth, richiedePermesso('statistiche.visualizza'));

statisticheRouter.get('/panoramica', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.panoramica(leggiPeriodo(req), leggiFiltroEventi(req)));
}));
statisticheRouter.get('/da-guardare', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await statisticheService.daGuardare());
}));
statisticheRouter.get('/opzioni-filtri', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await statisticheService.opzioniFiltri());
}));
statisticheRouter.get('/confronto', asyncHandler(async (req: Request, res: Response) => {
  const per = z.enum(['categoria', 'genere', 'citta', 'tour', 'mese']).safeParse(req.query.per);
  if (!per.success) throw new ErroreApplicativo('Scegli come raggruppare: categoria, genere, città, tour o mese.', 400, 'RAGGRUPPAMENTO_NON_VALIDO');
  res.json(await statisticheService.confronto(leggiPeriodo(req), per.data, leggiFiltroEventi(req)));
}));
statisticheRouter.get('/eventi', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.eventi(leggiPeriodo(req), leggiFiltroEventi(req)));
}));
statisticheRouter.get('/eventi/:id', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.evento(req.params.id));
}));
statisticheRouter.get('/vendite', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.vendite(leggiPeriodo(req), leggiFiltroEventi(req)));
}));
statisticheRouter.get('/clienti', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.clienti(leggiPeriodo(req), leggiFiltroEventi(req)));
}));
statisticheRouter.get('/costi', asyncHandler(async (req: Request, res: Response) => {
  res.json(await statisticheService.costi(leggiPeriodo(req), leggiFiltroEventi(req)));
}));
statisticheRouter.get('/bus-in-piu', asyncHandler(async (req: Request, res: Response) => {
  const anno = z.coerce.number().int().min(2000).max(2100).safeParse(req.query.anno);
  if (!anno.success) throw new ErroreApplicativo("Anno non valido: scrivilo con quattro cifre, per esempio 2026.", 400, 'ANNO_NON_VALIDO');
  res.json(await simulazioneBusService.anno(anno.data, leggiFiltroEventi(req)));
}));
