import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { fermate, preventiviRichieste, preventiviRisposte, tragitti } from '../../db/schema.js';
import { calcolaKmApprossimati } from '../../shared/distanza.js';

/** Percorso cambiato dopo il preventivo accettato.
 *
 *  Quando si accetta o si registra un preventivo, il tragitto salva le sue
 *  fermate attive (le città, in ordine), i km e il momento: è il percorso
 *  su cui il fornitore ha fatto il prezzo. Se poi si tolgono o si
 *  aggiungono fermate (in Eventi, in Partenze o nelle linee), il preventivo
 *  va rifatto: il gestionale lo segnala in viola, il colore riservato a
 *  questo caso, finché non si accetta un nuovo preventivo o si conferma che
 *  quello attuale va ancora bene.
 *
 *  Lo stato dice sempre cosa fare:
 *  - da_richiedere: chiedere un nuovo preventivo, o confermare quello attuale;
 *  - in_attesa: richiesta per cambio percorso inviata, nessuna risposta ancora;
 *  - da_valutare: almeno una risposta arrivata, da accettare. */

export type StatoCambioPercorso = 'da_richiedere' | 'in_attesa' | 'da_valutare';

export interface CambioPercorso {
  tragittoId: string;
  stato: StatoCambioPercorso;
  fermateTolte: string[];
  fermateAggiunte: string[];
}

/** Una richiesta per cambio percorso è della tornata in corso se è
 *  arrivata dopo l'ultimo aggiornamento del percorso del preventivo (null =
 *  percorso fotografato dall'aggiornamento del gestionale, senza data). */
export function richiestaAperta(creataIl: Date, percorsoPreventivoIl: Date | null): boolean {
  return percorsoPreventivoIl == null || creataIl.getTime() >= percorsoPreventivoIl.getTime();
}

/** Fermate tolte e aggiunte rispetto al percorso del preventivo; null se
 *  sono le stesse (l'ordine non conta). */
export function confrontaFermate(fermatePreventivo: string[], fermateAttive: string[]) {
  const prima = new Set(fermatePreventivo);
  const adesso = new Set(fermateAttive);
  const fermateTolte = fermatePreventivo.filter((c) => !adesso.has(c));
  const fermateAggiunte = fermateAttive.filter((c) => !prima.has(c));
  return fermateTolte.length === 0 && fermateAggiunte.length === 0 ? null : { fermateTolte, fermateAggiunte };
}

/** I tragitti indicati il cui percorso è cambiato dal preventivo (gli altri
 *  non compaiono nella mappa). */
export async function cambiPercorso(tragittiIds: string[]): Promise<Map<string, CambioPercorso>> {
  const risultato = new Map<string, CambioPercorso>();
  if (tragittiIds.length === 0) return risultato;
  const righe = await db.select({
    id: tragitti.id, fermatePreventivo: tragitti.fermatePreventivo, percorsoPreventivoIl: tragitti.percorsoPreventivoIl,
  }).from(tragitti)
    .where(and(inArray(tragitti.id, tragittiIds), isNotNull(tragitti.preventivoCosto), isNotNull(tragitti.fermatePreventivo)));
  if (righe.length === 0) return risultato;

  const righeFermate = await db.select({ tragittoId: fermate.tragittoId, citta: fermate.citta }).from(fermate)
    .where(and(inArray(fermate.tragittoId, righe.map((r) => r.id)), eq(fermate.attivo, true)))
    .orderBy(asc(fermate.ordine));
  const attivePerTragitto = new Map<string, string[]>();
  for (const f of righeFermate) attivePerTragitto.set(f.tragittoId, [...(attivePerTragitto.get(f.tragittoId) ?? []), f.citta]);

  const cambiati = righe
    .map((t) => ({ t, differenze: confrontaFermate(t.fermatePreventivo ?? [], attivePerTragitto.get(t.id) ?? []) }))
    .filter((c): c is { t: typeof c.t; differenze: NonNullable<typeof c.differenze> } => c.differenze !== null);
  if (cambiati.length === 0) return risultato;

  const richieste = await db.select({
    tragittoId: preventiviRichieste.tragittoId, creataIl: preventiviRichieste.creataIl, rispostaId: preventiviRisposte.id,
  }).from(preventiviRichieste)
    .leftJoin(preventiviRisposte, eq(preventiviRisposte.richiestaId, preventiviRichieste.id))
    .where(and(inArray(preventiviRichieste.tragittoId, cambiati.map((c) => c.t.id)), eq(preventiviRichieste.perCambioPercorso, true)));

  for (const { t, differenze } of cambiati) {
    const aperte = richieste.filter((r) => r.tragittoId === t.id && richiestaAperta(r.creataIl, t.percorsoPreventivoIl));
    const stato: StatoCambioPercorso = aperte.some((r) => r.rispostaId) ? 'da_valutare' : aperte.length > 0 ? 'in_attesa' : 'da_richiedere';
    risultato.set(t.id, { tragittoId: t.id, stato, ...differenze });
  }
  return risultato;
}

/** I nomi dei tragitti indicati con il percorso cambiato dal preventivo:
 *  per l'avviso subito dopo aver salvato le fermate. */
export async function nomiPercorsiCambiati(tragittiIds: string[]): Promise<string[]> {
  const ids = [...(await cambiPercorso(tragittiIds)).keys()];
  if (ids.length === 0) return [];
  const righe = await db.select({ nome: tragitti.nome }).from(tragitti).where(inArray(tragitti.id, ids));
  return righe.map((r) => r.nome);
}

/** Il percorso di adesso, da salvare sul tragitto quando si accetta o si
 *  registra un preventivo, o si conferma che quello attuale va ancora bene. */
export async function fotografiaPercorso(tragittoId: string) {
  const righe = await db.select({ citta: fermate.citta }).from(fermate)
    .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true)))
    .orderBy(asc(fermate.ordine));
  const km = await calcolaKmApprossimati(tragittoId);
  return {
    fermatePreventivo: righe.map((r) => r.citta),
    percorsoPreventivoIl: new Date(),
    ...(km != null && { kmAccettati: km }),
  };
}
