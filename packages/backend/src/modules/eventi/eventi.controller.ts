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
  async getBySlug(req: Request, res: Response) {
    const evento = await eventiService.getBySlug(req.params.slug);
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

  async eventiEliminati(_req: Request, res: Response) {
    res.json(await eventiService.eventiEliminati());
  },
  async ripristinaEvento(req: Request, res: Response) {
    await eventiService.ripristinaEvento(req.params.id);
    res.json({ ok: true });
  },
  async tratteEliminate(_req: Request, res: Response) {
    res.json(await eventiService.tratteEliminate());
  },
  async ripristinaTratta(req: Request, res: Response) {
    await eventiService.ripristinaTratta(req.params.id);
    res.json({ ok: true });
  },

  async opzioniPartenza(req: Request, res: Response) {
    const opzioni = await eventiService.opzioniPartenza(req.params.id, req.query.servizioId as string | undefined);
    res.json(opzioni);
  },

  async calcolaBus(req: Request, res: Response) {
    res.json(await eventiService.calcolaBusNecessari(req.params.id));
  },

  async listaBus(req: Request, res: Response) {
    res.json(await eventiService.listaBus(req.params.id));
  },

  async creaLinea(req: Request, res: Response) {
    const risultato = await eventiService.creaLinea(req.params.id, req.body);
    res.status(201).json(risultato);
  },
  async aggiungiBusALinea(req: Request, res: Response) {
    const busId = await eventiService.aggiungiBusALinea(req.params.lineaId, req.body);
    res.status(201).json({ id: busId });
  },
  async aggiornaPercorsoLinea(req: Request, res: Response) {
    await eventiService.aggiornaPercorsoLinea(req.params.id, req.params.lineaId, req.body.fermateIds);
    res.json({ ok: true });
  },
  async aggiornaBusDiLinea(req: Request, res: Response) {
    await eventiService.aggiornaBusDiLinea(req.params.busId, req.body);
    res.json({ ok: true });
  },
  async listaLinee(req: Request, res: Response) {
    res.json(await eventiService.listaLinee(req.params.tragittoId));
  },
  async versaLinea(req: Request, res: Response) {
    res.json(await eventiService.versaLinea(req.params.lineaId));
  },

  async aggiornaTragittoOperativo(req: Request, res: Response) {
    await eventiService.aggiornaTragittoOperativo(req.params.tragittoId, req.body);
    res.json({ ok: true });
  },
  async registraPreventivo(req: Request, res: Response) {
    await eventiService.registraPreventivo(req.params.tragittoId, req.body);
    res.json({ ok: true });
  },

  async rimuoviBus(req: Request, res: Response) {
    await eventiService.rimuoviBus(req.params.busId);
    res.status(204).send();
  },

  async listaPasseggeriBus(req: Request, res: Response) {
    res.json(await eventiService.listaPasseggeriBus(req.params.busId));
  },

  async riepilogoEconomico(req: Request, res: Response) {
    res.json(await eventiService.riepilogoEconomico(req.params.id));
  },

  async allertePartenze(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaAllertePartenze() });
  },
  async eventiDaConfermare(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaEventiDaConfermare() });
  },
  async allertePartenzePerEvento(_req: Request, res: Response) {
    res.json(await eventiService.allertePartenzePerEvento());
  },
  async elencoPartenze(_req: Request, res: Response) {
    res.json(await eventiService.elencoPartenze());
  },
  async statistichePerEvento(_req: Request, res: Response) {
    res.json(await eventiService.statistichePerEvento());
  },
  async tragittoHaPrenotazioniConfermate(req: Request, res: Response) {
    res.json(await eventiService.tragittoHaPrenotazioniConfermate(req.params.tragittoId));
  },
};
