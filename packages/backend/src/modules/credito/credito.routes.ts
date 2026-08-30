import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { creditoService } from './credito.service.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const creditoRouter = Router();

/** Pubblica apposta: al checkout non c'è login, solo l'email in comune
 *  — non espone nient'altro del cliente, solo il saldo disponibile. */
creditoRouter.get(
  '/',
  valida(z.object({ email: z.string().email() }), 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const disponibile = await creditoService.creditoDisponibile(req.query.email as string);
    res.json({ disponibile });
  }),
);

