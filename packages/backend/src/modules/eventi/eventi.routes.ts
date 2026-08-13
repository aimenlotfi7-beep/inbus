import { Router } from 'express';
import { eventiController } from './eventi.controller.js';
import { creaEventoSchema, aggiornaEventoSchema, listaEventiQuerySchema } from './eventi.dto.js';
import { valida } from '../../shared/validate.js';
import { asyncHandler } from '../../shared/http.js';
import { richiedeAuth, richiedeRuolo } from '../auth/auth.middleware.js';

export const eventiRouter = Router();

// Lettura: pubblica (il sito e l'app cliente le usano senza login)
eventiRouter.get('/', valida(listaEventiQuerySchema, 'query'), asyncHandler(eventiController.list));
eventiRouter.get('/:id', asyncHandler(eventiController.getById));
eventiRouter.get('/:id/opzioni-partenza', asyncHandler(eventiController.opzioniPartenza));

// Scrittura: riservata ad amministratore/operatore
eventiRouter.post(
  '/',
  richiedeAuth,
  richiedeRuolo('AMMINISTRATORE', 'OPERATORE'),
  valida(creaEventoSchema),
  asyncHandler(eventiController.create)
);
eventiRouter.put(
  '/:id',
  richiedeAuth,
  richiedeRuolo('AMMINISTRATORE', 'OPERATORE'),
  valida(aggiornaEventoSchema),
  asyncHandler(eventiController.update)
);
eventiRouter.delete(
  '/:id',
  richiedeAuth,
  richiedeRuolo('AMMINISTRATORE'),
  asyncHandler(eventiController.remove)
);
