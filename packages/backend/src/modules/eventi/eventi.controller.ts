import type { Request, Response } from 'express';
import { eventiService } from './eventi.service.js';
import { smistamentoService } from '../prenotazioni/smistamento.service.js';
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
  async conteggioPrenotazioniConfermate(req: Request, res: Response) {
    res.json({ conteggio: await eventiService.conteggioPrenotazioniConfermate(req.params.id) });
  },

  async create(req: Request, res: Response) {
    const id = await eventiService.create(req.body as CreaEventoInput);
    const evento = await eventiService.getById(id);
    res.status(201).json(evento);
  },

  async update(req: Request, res: Response) {
    const { id, clientiAvvisati, emailNonInviate } = await eventiService.update(req.params.id, req.body as AggiornaEventoInput);
    const evento = await eventiService.getById(id);
    res.json({ ...evento, clientiAvvisati, emailNonInviate });
  },
  async anteprimaVariazioniEvento(req: Request, res: Response) {
    res.json(await eventiService.anteprimaVariazioniEvento(req.params.id, req.body as AggiornaEventoInput));
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
    const { busId, tourLeaderAvvisato } = await eventiService.aggiungiBusALinea(req.params.lineaId, req.body);
    res.status(201).json({ id: busId, tourLeaderAvvisato });
  },
  async aggiornaPercorsoLinea(req: Request, res: Response) {
    await eventiService.aggiornaPercorsoLinea(req.params.id, req.params.lineaId, req.body.fermateIds);
    res.json({ ok: true });
  },
  async aggiornaBusDiLinea(req: Request, res: Response) {
    const { tourLeaderAvvisato } = await eventiService.aggiornaBusDiLinea(req.params.busId, req.body);
    res.json({ ok: true, tourLeaderAvvisato });
  },
  async listaLinee(req: Request, res: Response) {
    res.json(await eventiService.listaLinee(req.params.tragittoId));
  },
  /** Elimina la linea e i suoi bus: i passeggeri assegnati tornano senza
   *  bus e li riprende lo smistamento automatico. */
  async eliminaLinea(req: Request, res: Response) {
    await eventiService.eliminaLinea(req.params.lineaId);
    res.json({ ok: true });
  },
  /** Come verrebbero riempiti i bus del tragitto, senza scritture. */
  async anteprimaSmistamento(req: Request, res: Response) {
    res.json(await smistamentoService.anteprima(req.params.tragittoId));
  },

  async aggiornaTragittoOperativo(req: Request, res: Response) {
    const { clientiAvvisati, emailNonInviate } = await eventiService.aggiornaTragittoOperativo(req.params.tragittoId, req.body);
    res.json({ ok: true, clientiAvvisati, emailNonInviate });
  },
  async anteprimaTragittoOperativo(req: Request, res: Response) {
    res.json(await eventiService.anteprimaTragittoOperativo(req.params.tragittoId, req.body));
  },
  async registraPreventivoManuale(req: Request, res: Response) {
    await eventiService.registraPreventivoManuale(req.params.tragittoId, req.body);
    res.json({ ok: true });
  },
  async calcolaPrezziVendita(req: Request, res: Response) {
    await eventiService.calcolaPrezziVendita(req.params.tragittoId, req.body);
    res.json({ ok: true });
  },

  async rimuoviBus(req: Request, res: Response) {
    await eventiService.rimuoviBus(req.params.id, req.params.busId);
    res.status(204).send();
  },

  async listaPasseggeriBus(req: Request, res: Response) {
    res.json(await eventiService.listaPasseggeriBus(req.params.id, req.params.busId));
  },
  async pdfPasseggeriBus(req: Request, res: Response) {
    const { pdf, nomeFile } = await eventiService.pdfPasseggeriBus(req.params.id, req.params.busId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeFile}"`);
    res.send(pdf);
  },

  async riepilogoEconomico(req: Request, res: Response) {
    res.json(await eventiService.riepilogoEconomico(req.params.id));
  },

  async venditePerFermata(req: Request, res: Response) {
    res.json(await eventiService.venditePerFermata(req.params.tragittoId));
  },
  async suggerimentoLinea(req: Request, res: Response) {
    res.json(await eventiService.suggerimentoLinea(req.params.tragittoId));
  },

  async allertePartenze(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaAllertePartenze() });
  },
  async eventiDaCalcolareOrari(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaEventiDaCalcolareOrari() });
  },
  async eventiDaPrezzare(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaEventiDaPrezzare() });
  },
  async eventiPreventiviDaRichiedere(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaEventiPreventiviDaRichiedere() });
  },
  async lineeProntoDaConfermare(_req: Request, res: Response) {
    res.json({ conteggio: await eventiService.contaLineeProntoDaConfermare() });
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
