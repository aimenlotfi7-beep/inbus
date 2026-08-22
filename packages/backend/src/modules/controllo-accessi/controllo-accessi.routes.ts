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
