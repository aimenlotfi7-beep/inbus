import type { Request, Response } from 'express';
import { eventiService } from './eventi.service.js';
import type { CreaEventoInput, AggiornaEventoInput, ListaEventiQuery } from './eventi.dto.js';

export const eventiController = {
  async list(req: Request, res: Response) {
    const eventi = await eventiService.list(req.query as unknown as ListaEventiQuery);
    res.json(eventi);
  },

  async getById(req: Request, res: Response) {
    const evento = await eventiService.getById(req.params.id);
    res.json(evento);
  },

  async create(req: Request, res: Response) {
    const id = await eventiService.create(req.body as CreaEventoInput);
    const evento = await eventiService.getById(id);
    res.status(201).json(evento);
  },

  async update(req: Request, res: Response) {
    const id = await eventiService.update(req.params.id, req.body as AggiornaEventoInput);
    const evento = await eventiService.getById(id);
    res.json(evento);
  },

  async remove(req: Request, res: Response) {
    await eventiService.remove(req.params.id);
    res.status(204).send();
  },

  async opzioniPartenza(req: Request, res: Response) {
    const opzioni = await eventiService.opzioniPartenza(req.params.id);
    res.json(opzioni);
  },

  async calcolaBus(req: Request, res: Response) {
    res.json(await eventiService.calcolaBusNecessari(req.params.id));
  },

  async impostaCopertura(req: Request, res: Response) {
    await eventiService.impostaCopertura(req.params.id, req.params.lineaId, req.body.coperta, req.body.noteCoperta);
    res.json({ ok: true });
  },

  async listaBus(req: Request, res: Response) {
    res.json(await eventiService.listaBus(req.params.id));
  },

  async creaBus(req: Request, res: Response) {
    const busId = await eventiService.creaBus(req.params.id, req.body);
    res.status(201).json({ id: busId });
  },

  async aggiornaBus(req: Request, res: Response) {
    await eventiService.aggiornaBus(req.params.id, req.params.busId, req.body);
    res.json({ ok: true });
  },

  async rimuoviBus(req: Request, res: Response) {
    await eventiService.rimuoviBus(req.params.busId);
    res.status(204).send();
  },

  async listaPasseggeriBus(req: Request, res: Response) {
    res.json(await eventiService.listaPasseggeriBus(req.params.busId));
  },

  async allertePartenze(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaAllertePartenze() });
  },
};
