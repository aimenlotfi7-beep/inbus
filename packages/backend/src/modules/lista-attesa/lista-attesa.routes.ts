import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { listaAttesaService } from './lista-attesa.service.js';
import { iscrivitiListaAttesaSchema } from './lista-attesa.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { nonPerCollaboratori, richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';
import { limitePnr, limiteRegistrazione } from '../../shared/rateLimit.js';

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
  async contaInAttesa(_req: Request, res: Response) {
    res.json({ conteggio: await listaAttesaService.contaInAttesa() });
  },
  async contaInAttesaPerEvento(_req: Request, res: Response) {
    res.json(await listaAttesaService.contaInAttesaPerEvento());
  },
  async contaPerEventoEStato(_req: Request, res: Response) {
    res.json(await listaAttesaService.contaPerEventoEStato());
  },
  async promuovi(req: Request, res: Response) {
    res.json(await listaAttesaService.promuovi(req.params.id));
  },
  async promuoviTutte(req: Request, res: Response) {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string') : undefined;
    res.json(await listaAttesaService.promuoviTutte(req.params.eventoId, ids));
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
listaAttesaRouter.post('/', limiteRegistrazione, valida(iscrivitiListaAttesaSchema), asyncHandler(listaAttesaController.iscriviti));
// Le proprie iscrizioni: /api/cliente-auth/me/lista-attesa (con l'account).
listaAttesaRouter.get('/finalizza/:token', limitePnr, asyncHandler(listaAttesaController.getByToken));
listaAttesaRouter.post('/finalizza/:token', limitePnr, valida(finalizzaSchema), asyncHandler(listaAttesaController.finalizza));

// Amministrazione: elenco per evento (sezione "Lista d'attesa" nella
// scheda evento) e promozione (manda l'email con il link). Sono clienti:
// le gestisce il team OnWay, non i collaboratori.
const gestionale = [richiedeAuth, nonPerCollaboratori];
listaAttesaRouter.get('/allerte', ...gestionale, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaInAttesa));
listaAttesaRouter.get('/allerte-per-evento', ...gestionale, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaInAttesaPerEvento));
listaAttesaRouter.get('/conta-per-evento-e-stato', ...gestionale, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.contaPerEventoEStato));
listaAttesaRouter.get('/eventi/:eventoId', ...gestionale, richiedePermesso('eventi.partenze'), asyncHandler(listaAttesaController.listByEvento));
listaAttesaRouter.post('/:id/promuovi', ...gestionale, richiedePermesso('eventi.crea'), asyncHandler(listaAttesaController.promuovi));
listaAttesaRouter.post('/evento/:eventoId/promuovi-tutte', ...gestionale, richiedePermesso('eventi.crea'), asyncHandler(listaAttesaController.promuoviTutte));
