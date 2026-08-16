import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { listaAttesaService } from './lista-attesa.service.js';
import { iscrivitiListaAttesaSchema } from './lista-attesa.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const finalizzaSchema = z.object({
  lineaId: z.string().min(1),
  fermataId: z.string().min(1),
  tipoPagamento: z.enum(['COMPLETO', 'ACCONTO']).default('COMPLETO'),
  metodoPagamento: z.enum(['CARTA', 'PAYPAL', 'SATISPAY', 'DA_CONCORDARE']).default('CARTA'),
});

export const listaAttesaController = {
  async iscriviti(req: Request, res: Response) {
    res.status(201).json(await listaAttesaService.iscriviti(req.body));
  },
  async listByEvento(req: Request, res: Response) {
    res.json(await listaAttesaService.listByEvento(req.params.eventoId));
  },
  async contaPartecipanti(req: Request, res: Response) {
    res.json({ partecipanti: await listaAttesaService.contaPartecipanti(req.params.eventoId) });
  },
  async promuovi(req: Request, res: Response) {
    res.json(await listaAttesaService.promuovi(req.params.id));
  },
  async getByToken(req: Request, res: Response) {
    res.json(await listaAttesaService.getByToken(req.params.token));
  },
  async finalizza(req: Request, res: Response) {
    res.status(201).json(await listaAttesaService.finalizza(req.params.token, req.body));
  },
};

export const listaAttesaRouter = Router();

// Pubbliche: iscrizione dal checkout del sito, finalizzazione dal link email.
listaAttesaRouter.post('/', valida(iscrivitiListaAttesaSchema), asyncHandler(listaAttesaController.iscriviti));
listaAttesaRouter.get('/finalizza/:token', asyncHandler(listaAttesaController.getByToken));
listaAttesaRouter.post('/finalizza/:token', valida(finalizzaSchema), asyncHandler(listaAttesaController.finalizza));

// Amministrazione: elenco per evento (sezione "Lista d'attesa" nella
// scheda evento) e promozione (manda l'email con il link).
listaAttesaRouter.get('/eventi/:eventoId', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.listByEvento));
listaAttesaRouter.get('/eventi/:eventoId/conta-partecipanti', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaPartecipanti));
listaAttesaRouter.post('/:id/promuovi', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(listaAttesaController.promuovi));
