import { Router } from 'express';
import { eventiController } from './eventi.controller.js';
import { creaEventoSchema, aggiornaEventoSchema, listaEventiQuerySchema } from './eventi.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedePermesso } from '../auth/auth.middleware.js';

export const eventiRouter = Router();

// Lettura: pubblica (il sito e l'app cliente le usano senza login)
eventiRouter.get('/', valida(listaEventiQuerySchema, 'query'), asyncHandler(eventiController.list));
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
