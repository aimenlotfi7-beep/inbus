import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/http.js';
import { valida } from '../../shared/validate.js';
import { nonPerCollaboratori, richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { aggiornaSpesaSchema, creaSpesaSchema, filtriSpeseSchema, pagamentoSchema } from './pagamenti-fornitori.dto.js';
import { pagamentiFornitoriService } from './pagamenti-fornitori.service.js';

export const pagamentiFornitoriRouter = Router();
// Soldi che escono: è amministrazione, la gestisce il team OnWay (un
// collaboratore vede i costi dei suoi eventi, non la cassa).
pagamentiFornitoriRouter.use(richiedeAuth, nonPerCollaboratori);

pagamentiFornitoriRouter.get('/',
  richiedePermesso('pagamenti-fornitori.visualizza'),
  valida(filtriSpeseSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await pagamentiFornitoriService.elenco(req.query as never));
  }),
);

pagamentiFornitoriRouter.get('/:id/pagamenti',
  richiedePermesso('pagamenti-fornitori.visualizza'),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await pagamentiFornitoriService.pagamenti(req.params.id));
  }),
);

pagamentiFornitoriRouter.post('/',
  richiedePermesso('pagamenti-fornitori.gestisci'),
  valida(creaSpesaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await pagamentiFornitoriService.crea(req.body));
  }),
);

pagamentiFornitoriRouter.put('/:id',
  richiedePermesso('pagamenti-fornitori.gestisci'),
  valida(aggiornaSpesaSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await pagamentiFornitoriService.aggiorna(req.params.id, req.body));
  }),
);

pagamentiFornitoriRouter.delete('/:id',
  richiedePermesso('pagamenti-fornitori.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    await pagamentiFornitoriService.elimina(req.params.id);
    res.json({ ok: true });
  }),
);

pagamentiFornitoriRouter.post('/:id/pagamenti',
  richiedePermesso('pagamenti-fornitori.gestisci'),
  valida(pagamentoSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json(await pagamentiFornitoriService.registraPagamento(req.params.id, req.body, req.admin?.sub));
  }),
);

pagamentiFornitoriRouter.delete('/pagamenti/:id',
  richiedePermesso('pagamenti-fornitori.gestisci'),
  asyncHandler(async (req: Request, res: Response) => {
    await pagamentiFornitoriService.eliminaPagamento(req.params.id);
    res.json({ ok: true });
  }),
);
