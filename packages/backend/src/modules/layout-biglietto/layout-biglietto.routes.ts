import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { layoutBigliettoService } from './layout-biglietto.service.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';

export const layoutBigliettoRouter = Router();
layoutBigliettoRouter.use(richiedeAuth, richiedePermesso('layout-biglietto.gestisci'));

layoutBigliettoRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await layoutBigliettoService.list());
}));

layoutBigliettoRouter.post(
  '/',
  valida(z.object({ nome: z.string().min(1), configurazione: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await layoutBigliettoService.crea(req.body));
  }),
);

layoutBigliettoRouter.put(
  '/:id',
  valida(z.object({ nome: z.string().min(1).optional(), configurazione: z.string().min(1).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    await layoutBigliettoService.aggiorna(req.params.id, req.body);
    res.json({ ok: true });
  }),
);

layoutBigliettoRouter.post('/:id/predefinito', asyncHandler(async (req: Request, res: Response) => {
  await layoutBigliettoService.impostaPredefinito(req.params.id);
  res.json({ ok: true });
}));

layoutBigliettoRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await layoutBigliettoService.elimina(req.params.id);
  res.json({ ok: true });
}));

/** Genera un PDF di prova con dati finti — non salva niente, serve solo
 *  a vedere il risultato prima di confermare le modifiche a una
 *  configurazione (anche non ancora salvata). */
layoutBigliettoRouter.post(
  '/anteprima',
  valida(z.object({ configurazione: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const pdf = await layoutBigliettoService.generaAnteprima(req.body.configurazione);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="anteprima-biglietto.pdf"');
    res.send(pdf);
  }),
);
