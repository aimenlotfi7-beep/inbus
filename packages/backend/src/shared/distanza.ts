import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tragitti, fermate, fermateAnagrafica } from '../db/schema.js';

/** Distanza in linea d'aria tra due punti (km) — stessa formula usata
 *  per il raggio dei fornitori (shared/geo lato frontend, replicata
 *  qui lato server perché serve senza passare da una chiamata HTTP). */
export function distanzaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  const fermateAttive = await db.select().from(fermate).where(eq(fermate.tragittoId, tragittoId));
  const conCoordinate: { lat: number; lng: number }[] = [];
  for (const f of fermateAttive.filter((f) => f.attivo)) {
    if (!f.fermataAnagraficaId) continue;
    const [fa] = await db.select().from(fermateAnagrafica).where(eq(fermateAnagrafica.id, f.fermataAnagraficaId)).limit(1);
    if (fa?.lat != null && fa?.lng != null) conCoordinate.push({ lat: fa.lat, lng: fa.lng });
  }

  let totale = 0;
  let precedente = { lat: t.partenzaLat, lng: t.partenzaLng };
  for (const punto of conCoordinate) {
    totale += distanzaKm(precedente.lat, precedente.lng, punto.lat, punto.lng);
    precedente = punto;
  }
  return totale;
}
