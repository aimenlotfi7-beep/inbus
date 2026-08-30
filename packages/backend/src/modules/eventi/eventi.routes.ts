import { Router } from 'express';
import { eventiController } from './eventi.controller.js';
import { creaEventoSchema, aggiornaEventoSchema, listaEventiQuerySchema, aggiornaTragittoOperativoSchema, registraPreventivoSchema, creaLineaSchema, aggiungiBusALineaSchema, aggiornaBusDiLineaSchema, aggiornaPercorsoLineaSchema } from './eventi.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const eventiRouter = Router();

// Lettura: pubblica (il sito e l'app cliente le usano senza login)
eventiRouter.get('/', valida(listaEventiQuerySchema, 'query'), asyncHandler(eventiController.list));
// IMPORTANTE: va registrata PRIMA di GET '/:id', altrimenti Express la
// interpreterebbe come una richiesta per un evento con id "allerte-partenze".
eventiRouter.get('/allerte-partenze', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.allertePartenze));
eventiRouter.get('/eventi-da-confermare', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.eventiDaConfermare));
eventiRouter.get('/allerte-partenze-per-evento', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.allertePartenzePerEvento));
eventiRouter.get('/elenco-partenze', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.elencoPartenze));
eventiRouter.get('/statistiche-per-evento', richiedeAuth, richiedePermesso('eventi.visualizza'), asyncHandler(eventiController.statistichePerEvento));
eventiRouter.get('/tragitti/:tragittoId/prenotazioni-confermate', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.tragittoHaPrenotazioniConfermate));
// Cestino — stesso motivo, prima di GET '/:id'.
eventiRouter.get('/cestino/eventi', richiedeAuth, richiedePermesso('eventi.cestino'), asyncHandler(eventiController.eventiEliminati));
eventiRouter.post('/cestino/eventi/:id/ripristina', richiedeAuth, richiedePermesso('eventi.cestino'), asyncHandler(eventiController.ripristinaEvento));
eventiRouter.get('/cestino/tratte', richiedeAuth, richiedePermesso('eventi.cestino'), asyncHandler(eventiController.tratteEliminate));
eventiRouter.post('/cestino/tratte/:id/ripristina', richiedeAuth, richiedePermesso('eventi.cestino'), asyncHandler(eventiController.ripristinaTratta));
// Stesso motivo: va prima di GET '/:id' per non essere interpretata come
// una richiesta per un evento con id "slug".
eventiRouter.get('/slug/:slug', asyncHandler(eventiController.getBySlug));
eventiRouter.get('/:id', asyncHandler(eventiController.getById));
eventiRouter.get('/:id/opzioni-partenza', asyncHandler(eventiController.opzioniPartenza));

// Scrittura: riservata ad amministratore/operatore
eventiRouter.post(
  '/',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(creaEventoSchema),
  asyncHandler(eventiController.create)
);
eventiRouter.put(
  '/:id',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(aggiornaEventoSchema),
  asyncHandler(eventiController.update)
);
eventiRouter.delete(
  '/:id',
  richiedeAuth,
  richiedePermesso('eventi.elimina'),
  asyncHandler(eventiController.remove)
);

// Sezione Partenze: calcolo bus necessari, copertura tratte, bus fisici.
eventiRouter.get('/:id/calcola-bus', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.calcolaBus));
eventiRouter.get('/:id/bus', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaBus));

eventiRouter.post('/:id/servizi', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.creaServizio));
eventiRouter.put('/:id/servizi/:servizioId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.aggiornaServizio));
eventiRouter.delete('/:id/servizi/:servizioId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.eliminaServizio));

eventiRouter.post('/:id/linee', richiedeAuth, richiedePermesso('eventi.crea'), valida(creaLineaSchema), asyncHandler(eventiController.creaLinea));
eventiRouter.post('/linee/:lineaId/bus', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiungiBusALineaSchema), asyncHandler(eventiController.aggiungiBusALinea));
eventiRouter.put('/:id/linee/:lineaId/percorso', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaPercorsoLineaSchema), asyncHandler(eventiController.aggiornaPercorsoLinea));
eventiRouter.put('/linee/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaBusDiLineaSchema), asyncHandler(eventiController.aggiornaBusDiLinea));
eventiRouter.get('/tragitti/:tragittoId/linee', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaLinee));
eventiRouter.put('/tragitti/:tragittoId/operativo', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaTragittoOperativoSchema), asyncHandler(eventiController.aggiornaTragittoOperativo));
eventiRouter.put('/tragitti/:tragittoId/preventivo', richiedeAuth, richiedePermesso('eventi.crea'), valida(registraPreventivoSchema), asyncHandler(eventiController.registraPreventivo));
eventiRouter.delete('/:id/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.rimuoviBus));
eventiRouter.get('/:id/bus/:busId/passeggeri', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaPasseggeriBus));
eventiRouter.get('/:id/riepilogo-economico', richiedeAuth, richiedePermesso('eventi.economia'), asyncHandler(eventiController.riepilogoEconomico));
