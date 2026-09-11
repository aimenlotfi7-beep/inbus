import { eq, and, asc } from 'drizzle-orm';
import { distanzaKm } from './haversine.js';
import { db } from '../db/client.js';
import { fermate, fermateAnagrafica } from '../db/schema.js';

export { distanzaKm } from './haversine.js';

/** Km APPROSSIMATI di un tragitto: linea d'aria tra le fermate attive
 *  collegate all'anagrafica (quindi con coordinate già note), dalla prima
 *  all'ultima nell'ordine del percorso. Non è la distanza di guida vera:
 *  serve a dare un'idea di quanto cambia il percorso quando cambiano le
 *  fermate. Si parte dalla prima fermata attiva di adesso, non dalla
 *  partenza salvata alla prima richiesta di preventivo: se si toglie la
 *  partenza, i km devono accorciarsi. L'arrivo non è incluso (resta solo
 *  testo, senza coordinate). null se nessuna fermata ha coordinate. */
export async function calcolaKmApprossimati(tragittoId: string): Promise<number | null> {
  // Una query sola (join con l'anagrafica), nell'ordine logico delle fermate.
  const righe = await db.select({ lat: fermateAnagrafica.lat, lng: fermateAnagrafica.lng })
    .from(fermate)
    .innerJoin(fermateAnagrafica, eq(fermateAnagrafica.id, fermate.fermataAnagraficaId))
    .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true)))
    .orderBy(asc(fermate.ordine));
  const conCoordinate = righe.filter((r): r is { lat: number; lng: number } => r.lat != null && r.lng != null);
  if (conCoordinate.length === 0) return null;

  let totale = 0;
  for (let i = 1; i < conCoordinate.length; i++) {
    totale += distanzaKm(conCoordinate[i - 1].lat, conCoordinate[i - 1].lng, conCoordinate[i].lat, conCoordinate[i].lng);
  }
  return totale;
}
