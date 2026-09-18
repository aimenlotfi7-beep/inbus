import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { busFisici, busTratte, eventoResponsabile, linee, preventiviRichieste, preventiviRisposte, tragitti } from '../db/schema.js';
import { NonTrovato } from './errors.js';

/**
 * Collaboratori con "solo gli eventi assegnati" (proprietario, settembre
 * 2026): vedono e gestiscono solo gli eventi di cui sono responsabili
 * (eventoResponsabile). Il limite sta qui, in un posto solo:
 *
 * - le funzioni che lavorano su UN evento lo verificano dal parametro
 *   dell'indirizzo (evento, tragitto, linea, bus, richiesta o risposta di
 *   preventivo) con limitaAgliEventiAssegnati, agganciato con
 *   router.param() a ogni router: una funzione nuova con lo stesso
 *   parametro è protetta da sola;
 * - gli elenchi (eventi, partenze, calendario…) filtrano con eventiConsentiti;
 * - tutto quello che non si sa limitare è chiuso dai permessi
 *   (PERMESSI_COLLABORATORE in permessi.service.ts), e clienti e vendite
 *   (prenotazioni, lista d'attesa, comunicazioni) li gestisce il team
 *   OnWay (nonPerCollaboratori in auth.middleware.ts).
 *
 * Un evento non suo risponde "non trovato": il collaboratore non scopre
 * nemmeno che esiste.
 */

const perRichiesta = new WeakMap<Request, Promise<Set<string> | null>>();

/** Gli eventi che l'amministratore può toccare, o null se non ha limiti. */
export async function eventiConsentiti(amministratoreId: string): Promise<Set<string> | null> {
  const { permessiEffettivi } = await import('../modules/auth/permessi.service.js');
  const eff = await permessiEffettivi(amministratoreId);
  if (!eff.soloEventiAssegnati) return null;
  const righe = await db.select({ eventoId: eventoResponsabile.eventoId }).from(eventoResponsabile)
    .where(eq(eventoResponsabile.amministratoreId, amministratoreId));
  return new Set(righe.map((r) => r.eventoId));
}

/** Come sopra, per l'amministratore di questa richiesta (una volta sola per
 *  richiesta). Legge il token da sé: i parametri si controllano prima di
 *  richiedeAuth. Senza un token del gestionale valido: nessun limite (le
 *  pagine pubbliche restano pubbliche, e le funzioni del gestionale
 *  rispondono comunque 401 più avanti). */
export function eventiConsentitiPer(req: Request): Promise<Set<string> | null> {
  let esito = perRichiesta.get(req);
  if (!esito) {
    esito = (async () => {
      const adminId = req.admin?.sub ?? await adminDalToken(req);
      return adminId ? eventiConsentiti(adminId) : null;
    })();
    perRichiesta.set(req, esito);
  }
  return esito;
}

async function adminDalToken(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const { authService } = await import('../modules/auth/auth.service.js');
  try {
    return authService.verificaToken(header.slice('Bearer '.length)).sub;
  } catch {
    return null;
  }
}

/** Filtra un elenco agli eventi consentiti (niente filtro se non ci sono limiti). */
export async function soloConsentiti<T>(req: Request, elenco: T[], eventoDi: (voce: T) => string | null | undefined): Promise<T[]> {
  const consentiti = await eventiConsentitiPer(req);
  if (!consentiti) return elenco;
  return elenco.filter((voce) => {
    const eventoId = eventoDi(voce);
    return !!eventoId && consentiti.has(eventoId);
  });
}

/** Un conteggio per evento ({ eventoId: … }) ridotto agli eventi consentiti. */
export async function soloEventiConsentiti<T>(req: Request, perEvento: Record<string, T>): Promise<Record<string, T>> {
  const consentiti = await eventiConsentitiPer(req);
  if (!consentiti) return perEvento;
  return Object.fromEntries(Object.entries(perEvento).filter(([eventoId]) => consentiti.has(eventoId)));
}

type Risolutore = (valore: string) => Promise<string | null>;

/** Da agganciare con router.param(nome, …): se la richiesta è di un
 *  collaboratore, l'evento a cui porta il parametro deve essere suo. Se il
 *  parametro non porta a nessun evento la richiesta si ferma lo stesso. */
export function limitaAgliEventiAssegnati(risolvi: Risolutore) {
  return (req: Request, _res: Response, next: NextFunction, valore: string) => {
    eventiConsentitiPer(req)
      .then(async (consentiti) => {
        if (!consentiti) return next();
        const eventoId = await risolvi(valore);
        next(eventoId && consentiti.has(eventoId) ? undefined : new NonTrovato('Evento'));
      })
      .catch(next);
  };
}

// ---------------------------------------------------------------- Da un parametro all'evento

export const eventoDaEvento: Risolutore = async (id) => id;

export const eventoDaTragitto: Risolutore = async (tragittoId) => {
  const [t] = await db.select({ eventoId: tragitti.eventoId }).from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
  return t?.eventoId ?? null;
};

export const eventoDaLinea: Risolutore = async (lineaId) => {
  const [l] = await db.select({ tragittoId: linee.tragittoId }).from(linee).where(eq(linee.id, lineaId)).limit(1);
  return l ? eventoDaTragitto(l.tragittoId) : null;
};

/** Un bus di una linea, o (bus registrati prima delle linee) di un tragitto. */
export const eventoDaBus: Risolutore = async (busId) => {
  const [b] = await db.select({ lineaId: busFisici.lineaId }).from(busFisici).where(eq(busFisici.id, busId)).limit(1);
  if (!b) return null;
  if (b.lineaId) return eventoDaLinea(b.lineaId);
  const [bt] = await db.select({ tragittoId: busTratte.tragittoId }).from(busTratte).where(eq(busTratte.busId, busId)).limit(1);
  return bt ? eventoDaTragitto(bt.tragittoId) : null;
};

export const eventoDaRichiestaPreventivo: Risolutore = async (richiestaId) => {
  const [r] = await db.select({ tragittoId: preventiviRichieste.tragittoId }).from(preventiviRichieste).where(eq(preventiviRichieste.id, richiestaId)).limit(1);
  return r ? eventoDaTragitto(r.tragittoId) : null;
};

export const eventoDaRispostaPreventivo: Risolutore = async (rispostaId) => {
  const [r] = await db.select({ richiestaId: preventiviRisposte.richiestaId }).from(preventiviRisposte).where(eq(preventiviRisposte.id, rispostaId)).limit(1);
  return r ? eventoDaRichiestaPreventivo(r.richiestaId) : null;
};
