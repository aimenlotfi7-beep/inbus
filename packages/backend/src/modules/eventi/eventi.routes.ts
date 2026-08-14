import { Router } from 'express';
import { eventiController } from './eventi.controller.js';
import { creaEventoSchema, aggiornaEventoSchema, listaEventiQuerySchema, impostaCoperturaSchema, creaBusSchema, aggiornaBusSchema } from './eventi.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const eventiRouter = Router();

// Lettura: pubblica (il sito e l'app cliente le usano senza login)
eventiRouter.get('/', valida(listaEventiQuerySchema, 'query'), asyncHandler(eventiController.list));
// IMPORTANTE: va registrata PRIMA di GET '/:id', altrimenti Express la
// interpreterebbe come una richiesta per un evento con id "allerte-partenze".
eventiRouter.get('/allerte-partenze', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.allertePartenze));
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
eventiRouter.put(
  '/:id/linee/:lineaId/copertura',
  richiedeAuth,
  richiedePermesso('eventi.crea'),
  valida(impostaCoperturaSchema),
  asyncHandler(eventiController.impostaCopertura)
);
eventiRouter.get('/:id/bus', richiedeAuth, richiedePermesso('eventi.partenze'), asyncHandler(eventiController.listaBus));
eventiRouter.post('/:id/bus', richiedeAuth, richiedePermesso('eventi.crea'), valida(creaBusSchema), asyncHandler(eventiController.creaBus));
eventiRouter.put('/:id/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), valida(aggiornaBusSchema), asyncHandler(eventiController.aggiornaBus));
eventiRouter.delete('/:id/bus/:busId', richiedeAuth, richiedePermesso('eventi.crea'), asyncHandler(eventiController.rimuoviBus));
