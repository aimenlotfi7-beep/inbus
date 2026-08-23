import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ticketService } from './ticket.service.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const ticketRouter = Router();

/** Elenco biglietti di una prenotazione — solo quelli davvero emessi. */
ticketRouter.get(
  '/:pnr/lista',
  valida(z.object({ email: z.string().email() }), 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await ticketService.bigliettiPerCliente(req.params.pnr, String(req.query.email)));
  }),
);

/** Il PDF vero e proprio — pubblico apposta (il token stesso funge da
 *  chiave segreta, come il QR): così il cliente può mandare questo
 *  indirizzo a un amico, che lo apre senza dover accedere a niente. */
ticketRouter.get(
  '/scarica/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const { pdfBuffer, nomeFile } = await ticketService.rigeneraPdfPerToken(req.params.token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeFile}"`);
    res.send(pdfBuffer);
  }),
);
