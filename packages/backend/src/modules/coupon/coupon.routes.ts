import { Router, type Request, type Response } from 'express';
import { couponService } from './coupon.service.js';
import { creaCouponSchema, aggiornaCouponSchema } from './coupon.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';

export const couponRouter = Router();

couponRouter.use(richiedeAuth, richiedeRuolo('AMMINISTRATORE', 'OPERATORE'));

couponRouter.get('/', asyncHandler(async (_req: Request, res: Response) => res.json(await couponService.list())));
couponRouter.post('/', valida(creaCouponSchema), asyncHandler(async (req: Request, res: Response) => res.status(201).json(await couponService.create(req.body))));
couponRouter.put('/:id', valida(aggiornaCouponSchema), asyncHandler(async (req: Request, res: Response) => res.json(await couponService.update(req.params.id, req.body))));
couponRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => { await couponService.remove(req.params.id); res.status(204).send(); }));
