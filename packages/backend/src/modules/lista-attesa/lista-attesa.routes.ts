import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { listaAttesaService } from './lista-attesa.service.js';
import { iscrivitiListaAttesaSchema } from './lista-attesa.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

const finalizzaSchema = z.object({
  tragittoId: z.string().min(1),
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
  async contaInAttesa(_req: Request, res: Response) {
    res.json({ conteggio: await listaAttesaService.contaInAttesa() });
  },
  async mieIscrizioni(req: Request, res: Response) {
    res.json(await listaAttesaService.mieIscrizioni(String(req.query.email)));
  },
  async contaInAttesaPerEvento(_req: Request, res: Response) {
    res.json(await listaAttesaService.contaInAttesaPerEvento());
  },
  async promuovi(req: Request, res: Response) {
    res.json(await listaAttesaService.promuovi(req.params.id));
  },
  async promuoviTutte(req: Request, res: Response) {
    res.json(await listaAttesaService.promuoviTutte(req.params.eventoId));
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
listaAttesaRouter.get('/mie', valida(z.object({ email: z.string().email() }), 'query'), asyncHandler(listaAttesaController.mieIscrizioni));
listaAttesaRouter.get('/finalizza/:token', asyncHandler(listaAttesaController.getByToken));
listaAttesaRouter.post('/finalizza/:token', valida(finalizzaSchema), asyncHandler(listaAttesaController.finalizza));

// Amministrazione: elenco per evento (sezione "Lista d'attesa" nella
// scheda evento) e promozione (manda l'email con il link).
listaAttesaRouter.get('/allerte', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaInAttesa));
listaAttesaRouter.get('/allerte-per-evento', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaInAttesaPerEvento));
listaAttesaRouter.get('/eventi/:eventoId', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.listByEvento));
listaAttesaRouter.get('/eventi/:eventoId/conta-partecipanti', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaPartecipanti));
listaAttesaRouter.post('/:id/promuovi', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(listaAttesaController.promuovi));
listaAttesaRouter.post('/evento/:eventoId/promuovi-tutte', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(listaAttesaController.promuoviTutte));
