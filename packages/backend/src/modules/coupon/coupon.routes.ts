import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { couponService } from './coupon.service.js';
import { creaCouponSchema, aggiornaCouponSchema } from './coupon.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const couponRouter = Router();

/** Pubblica apposta: usata dal checkout (e dal saldo) per far vedere
 *  subito lo sconto vero prima di procedere, senza dover accedere. */
couponRouter.post(
  '/valida',
  valida(z.object({ codice: z.string().min(1), importo: z.number().positive(), eventoId: z.string().optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { sconto, coupon: c } = await couponService.valida(req.body.codice, req.body.importo, req.body.eventoId);
    res.json({ sconto, tipo: c.tipo, valore: c.valore });
  }),
);

couponRouter.use(richiedeAuth);

couponRouter.get('/', richiedePermesso('coupon.visualizza'), asyncHandler(async (_req: Request, res: Response) => res.json(await couponService.list())));
couponRouter.post('/', richiedePermesso('coupon.gestisci'), valida(creaCouponSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await couponService.create(req.body))));
couponRouter.put('/:id', richiedePermesso('coupon.gestisci'), valida(aggiornaCouponSchema), asyncHandler(async (req: Request, res: Response) => res.json(await couponService.update(req.params.id, req.body))));
couponRouter.delete('/:id', richiedePermesso('coupon.gestisci'), asyncHandler(async (req: Request, res: Response) => { await couponService.remove(req.params.id); res.status(204).send(); }));
