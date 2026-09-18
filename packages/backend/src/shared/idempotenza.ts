import { and, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { richiesteIdempotenti } from '../db/schema.js';
import { ConflittoDati } from './errors.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Operazioni critiche eseguite una volta sola (controllo della logica,
 * settembre 2026). Il sito manda con l'acquisto una chiave generata a ogni
 * tentativo (`chiaveRichiesta`): se la stessa richiesta arriva due volte
 * (doppio clic, ripetizione dopo un timeout, due schede) il server
 * restituisce la risposta della prima volta invece di prenotare di nuovo.
 *
 * La chiave si registra DENTRO la transazione dell'operazione:
 * - due richieste insieme: la seconda aspetta sul vincolo di unicità che la
 *   prima finisca, poi trova la sua risposta;
 * - se la prima fallisce (posti finiti, coupon esaurito…) tutto torna
 *   indietro, chiave compresa, e la stessa chiave si può riusare.
 */

/** La chiave che il sito può mandare: lettere, cifre, - e _, 16-100 caratteri. */
export const chiaveRichiestaSchema = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/, 'Chiave della richiesta non valida.').optional();

export async function unaVolta<T>(tx: Tx, ambito: string, chiave: string | undefined, lavoro: () => Promise<T>): Promise<{ risultato: T; ripetuta: boolean }> {
  if (!chiave) return { risultato: await lavoro(), ripetuta: false };
  const [nuova] = await tx.insert(richiesteIdempotenti).values({ ambito, chiave }).onConflictDoNothing()
    .returning({ chiave: richiesteIdempotenti.chiave });
  if (!nuova) {
    const [esistente] = await tx.select({ risposta: richiesteIdempotenti.risposta }).from(richiesteIdempotenti)
      .where(and(eq(richiesteIdempotenti.ambito, ambito), eq(richiesteIdempotenti.chiave, chiave))).limit(1);
    if (esistente?.risposta == null) throw new ConflittoDati('Questa richiesta è già in corso: aspetta un momento.');
    return { risultato: esistente.risposta as T, ripetuta: true };
  }
  const risultato = await lavoro();
  await tx.update(richiesteIdempotenti).set({ risposta: JSON.parse(JSON.stringify(risultato)) })
    .where(and(eq(richiesteIdempotenti.ambito, ambito), eq(richiesteIdempotenti.chiave, chiave)));
  return { risultato, ripetuta: false };
}

/** Le chiavi più vecchie di una settimana non servono più (giro giornaliero). */
export async function pulisciRichiesteVecchie(): Promise<number> {
  const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tolte = await db.delete(richiesteIdempotenti).where(lt(richiesteIdempotenti.creataIl, limite)).returning({ chiave: richiesteIdempotenti.chiave });
  return tolte.length;
}
