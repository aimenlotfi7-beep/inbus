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
};
