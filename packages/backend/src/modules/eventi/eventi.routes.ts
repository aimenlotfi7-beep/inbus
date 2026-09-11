import { Router } from 'express';
import { eventiController } from './eventi.controller.js';
import { creaEventoSchema, aggiornaEventoSchema, listaEventiQuerySchema, aggiornaTragittoOperativoSchema, registraPreventivoManualeSchema, calcolaPrezziVenditaSchema, creaLineaSchema, aggiungiBusALineaSchema, aggiornaBusDiLineaSchema, aggiornaPercorsoLineaSchema, impostaVenditeFermateSchema } from './eventi.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const eventiRouter = Router();

// Lettura: pubblica (il sito e l'app cliente le usano senza login)
eventiRouter.get('/', valida(listaEventiQuerySchema, 'query'), asyncHandler(eventiController.list));
// IMPORTANTE: va registrata PRIMA di GET '/:id', altrimenti Express la
// interpreterebbe come una richiesta per un evento con id "allerte-partenze".
eventiRouter.get('/allerte-partenze', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.allertePartenze));
eventiRouter.get('/eventi-da-calcolare-orari', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.eventiDaCalcolareOrari));
eventiRouter.get('/eventi-da-prezzare', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.eventiDaPrezzare));
eventiRouter.get('/eventi-preventivi-da-richiedere', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.eventiPreventiviDaRichiedere));
eventiRouter.get('/linee-pronto-da-confermare', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.lineeProntoDaConfermare));
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
eventiRouter.get('/:id/conteggio-prenotazioni', asyncHandler(eventiController.conteggioPrenotazioniConfermate));
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
// Anteprima di cosa cambierebbe per i clienti già prenotati (fermate,
// data, luogo) salvando questo corpo — stesso permesso e stessa
// validazione del PUT qui sopra, nessuna scrittura.
eventiRouter.post(
  '/:id/anteprima-variazioni',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(aggiornaEventoSchema),
  asyncHandler(eventiController.anteprimaVariazioniEvento)
);
eventiRouter.delete(
  '/:id',
  richiedeAuth,
  richiedePermesso('eventi.elimina'),
  asyncHandler(eventiController.remove)
);
// "Ferma vendite" / "Riapri vendite": l'evento sparisce dal sito e nessuno
// può più prenotarlo, nemmeno con il link o dal widget.
eventiRouter.put('/:id/vendite', richiedeAuth, richiedePermesso('eventi.crea'), valida(impostaVenditeFermateSchema), asyncHandler(eventiController.impostaVenditeFermate));

// Sezione Partenze: calcolo bus necessari, copertura tratte, bus fisici.
eventiRouter.get('/:id/calcola-bus', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.calcolaBus));
eventiRouter.get('/:id/bus', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaBus));

eventiRouter.post('/:id/linee', richiedeAuth, richiedePermesso('eventi.crea'), valida(creaLineaSchema), asyncHandler(eventiController.creaLinea));
// Conferma una linea da confermare (creata in automatico): dati del primo
// bus e fermate, come la creazione di una linea.
eventiRouter.post('/linee/:lineaId/conferma', richiedeAuth, richiedePermesso('eventi.crea'), valida(creaLineaSchema), asyncHandler(eventiController.confermaLinea));
eventiRouter.post('/linee/:lineaId/bus', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiungiBusALineaSchema), asyncHandler(eventiController.aggiungiBusALinea));
eventiRouter.put('/:id/linee/:lineaId/percorso', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaPercorsoLineaSchema), asyncHandler(eventiController.aggiornaPercorsoLinea));
eventiRouter.put('/linee/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaBusDiLineaSchema), asyncHandler(eventiController.aggiornaBusDiLinea));
// Elimina una linea con i suoi bus (i passeggeri tornano senza bus). Non
// esiste più l'assegnazione a mano ("versa"): decide solo lo smistamento.
eventiRouter.delete('/linee/:lineaId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.eliminaLinea));
eventiRouter.get('/tragitti/:tragittoId/linee', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaLinee));
eventiRouter.get('/tragitti/:tragittoId/anteprima-smistamento', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.anteprimaSmistamento));
eventiRouter.get('/tragitti/:tragittoId/vendite', richiedeAuth, richiedePermesso('eventi.economia'), asyncHandler(eventiController.venditePerFermata));
eventiRouter.get('/tragitti/:tragittoId/suggerimento-linea', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.suggerimentoLinea));
eventiRouter.put('/tragitti/:tragittoId/operativo', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaTragittoOperativoSchema), asyncHandler(eventiController.aggiornaTragittoOperativo));
// Anteprima delle variazioni (e di quanti clienti verrebbero avvisati)
// per lo stesso corpo del PUT qui sopra — nessuna scrittura.
eventiRouter.post('/tragitti/:tragittoId/operativo/anteprima', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaTragittoOperativoSchema), asyncHandler(eventiController.anteprimaTragittoOperativo));
eventiRouter.put('/tragitti/:tragittoId/preventivo', richiedeAuth, richiedePermesso('eventi.crea'), valida(registraPreventivoManualeSchema), asyncHandler(eventiController.registraPreventivoManuale));
eventiRouter.put('/tragitti/:tragittoId/prezzi-vendita', richiedeAuth, richiedePermesso('eventi.crea'), valida(calcolaPrezziVenditaSchema), asyncHandler(eventiController.calcolaPrezziVendita));
eventiRouter.delete('/:id/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.rimuoviBus));
eventiRouter.get('/:id/bus/:busId/passeggeri', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaPasseggeriBus));
eventiRouter.get('/:id/bus/:busId/passeggeri/pdf', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.pdfPasseggeriBus));
eventiRouter.get('/:id/riepilogo-economico', richiedeAuth, richiedePermesso('eventi.economia'), asyncHandler(eventiController.riepilogoEconomico));
