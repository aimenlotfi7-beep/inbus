import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/** Istruzioni di sicurezza che il server dà al browser insieme a ogni
 *  risposta. Il server risponde solo con dati (JSON), PDF dei biglietti e
 *  la mappa del sito: nessuna sua pagina deve finire dentro la pagina di
 *  un altro sito (frame-ancestors), il browser non deve "indovinare" un
 *  tipo di file diverso da quello dichiarato (nosniff) e l'indirizzo
 *  delle chiamate non va passato ad altri siti (Referrer-Policy).
 *  In produzione, il browser ricorda di usare sempre https (HSTS). */
export function intestazioniSicurezza(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}
