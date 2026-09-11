import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { controlloAccessiService } from './controllo-accessi.service.js';
import { richiedeAuthTourLeader } from '../tour-leader-auth/tour-leader-auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { NonAutorizzato } from '../../shared/errors.js';

export const controlloAccessiRouter = Router();
controlloAccessiRouter.use(richiedeAuthTourLeader);

controlloAccessiRouter.get('/bus', asyncHandler(async (req: Request, res: Response) => {
  if (!req.tourLeader) throw new NonAutorizzato();
  res.json(await controlloAccessiService.busAssegnati(req.tourLeader.sub));
}));

controlloAccessiRouter.get('/bus/:busId/stato', asyncHandler(async (req: Request, res: Response) => {
  if (!req.tourLeader) throw new NonAutorizzato();
  res.json(await controlloAccessiService.statoBus(req.params.busId, req.tourLeader.sub));
}));

controlloAccessiRouter.post(
  '/bus/:busId/scansiona',
  valida(z.object({ token: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.tourLeader) throw new NonAutorizzato();
    res.json(await controlloAccessiService.scansiona(req.params.busId, req.tourLeader.sub, req.body.token));
  }),
);

// La lista dei passeggeri del bus (dal giorno prima della partenza), la
// spunta "salito" e il PDF da stampare.
controlloAccessiRouter.get('/bus/:busId/passeggeri', asyncHandler(async (req: Request, res: Response) => {
  if (!req.tourLeader) throw new NonAutorizzato();
  res.json(await controlloAccessiService.listaPasseggeri(req.params.busId, req.tourLeader.sub));
}));
controlloAccessiRouter.get('/bus/:busId/passeggeri/pdf', asyncHandler(async (req: Request, res: Response) => {
  if (!req.tourLeader) throw new NonAutorizzato();
  const { pdf, nomeFile } = await controlloAccessiService.pdfPasseggeri(req.params.busId, req.tourLeader.sub);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
  res.send(pdf);
}));
controlloAccessiRouter.put(
  '/bus/:busId/passeggeri/:passeggeroId/salito',
  valida(z.object({ salito: z.boolean() })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.tourLeader) throw new NonAutorizzato();
    res.json(await controlloAccessiService.segnaSalito(req.params.busId, req.tourLeader.sub, req.params.passeggeroId, req.body.salito));
  }),
);

controlloAccessiRouter.get(
  '/cerca',
  valida(z.object({ q: z.string(), busId: z.string().min(1).optional() }), 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.tourLeader) throw new NonAutorizzato();
    const busId = typeof req.query.busId === 'string' ? req.query.busId : undefined;
    res.json(await controlloAccessiService.cerca(req.tourLeader.sub, String(req.query.q), busId));
  }),
);
controlloAccessiRouter.post(
  '/checkin-manuale',
  valida(z.object({ partecipanteId: z.string(), busId: z.string().min(1).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.tourLeader) throw new NonAutorizzato();
    res.json(await controlloAccessiService.checkinManuale(req.tourLeader.sub, req.body.partecipanteId, req.body.busId));
  }),
);
