import { eq, and, asc } from 'drizzle-orm';
import { distanzaKm } from './haversine.js';
import { db } from '../db/client.js';
import { tragitti, fermate, fermateAnagrafica } from '../db/schema.js';

export { distanzaKm } from './haversine.js';

/** Km APPROSSIMATI di un tragitto (linea d'aria, partenza + fermate
 *  intermedie collegate all'anagrafica, quindi con coordinate già
 *  note) — non è la distanza di guida vera, serve solo a rilevare un
 *  cambio grosso quando le fermate cambiano (vedi conversazione:
 *  "tolgo la partenza, cambiano i km" in Linee). L'arrivo non è
 *  incluso — resta sempre solo testo, mai coordinate (l'indirizzo
 *  vero cambia da evento a evento). Torna null se manca la posizione
 *  della partenza (nessuna richiesta preventivo fatta finora). */
export async function calcolaKmApprossimati(tragittoId: string): Promise<number | null> {
  const [t] = await db.select().from(tragitti).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!t || t.partenzaLat == null || t.partenzaLng == null) return null;

  // Una query sola (join con l'anagrafica), nell'ordine logico delle
  // fermate — prima era una query per fermata e l'ordine del database.
  const righe = await db.select({ lat: fermateAnagrafica.lat, lng: fermateAnagrafica.lng })
    .from(fermate)
    .innerJoin(fermateAnagrafica, eq(fermateAnagrafica.id, fermate.fermataAnagraficaId))
    .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true)))
    .orderBy(asc(fermate.ordine));
  const conCoordinate = righe.filter((r): r is { lat: number; lng: number } => r.lat != null && r.lng != null);

  let totale = 0;
  let precedente = { lat: t.partenzaLat, lng: t.partenzaLng };
  for (const punto of conCoordinate) {
    totale += distanzaKm(precedente.lat, precedente.lng, punto.lat, punto.lng);
    precedente = punto;
  }
  return totale;
}
