import { env } from '../config/env.js';

/** La posizione di un indirizzo dal server, per le richieste automatiche ai
 *  fornitori (nessuno è davanti allo schermo per farla fare al browser).
 *  Stesso servizio gratuito del gestionale (OpenStreetMap, Nominatim), una
 *  richiesta alla volta e al massimo una al secondo, come chiede il servizio.
 *  Le risposte restano in memoria finché il server è acceso: il controllo di
 *  ogni ora non richiede di nuovo gli stessi indirizzi. null se l'indirizzo
 *  non si trova o il servizio non risponde; durante i test non si esce mai
 *  in rete. */

export interface Coordinate { lat: number; lng: number }

const cache = new Map<string, Coordinate | null>();
let coda: Promise<unknown> = Promise.resolve();
let ultimaRichiesta = 0;

export async function geocodificaServer(testo: string): Promise<Coordinate | null> {
  if (env.NODE_ENV === 'test') return null;
  const chiave = testo.trim().toLowerCase();
  if (!chiave) return null;
  if (cache.has(chiave)) return cache.get(chiave) ?? null;

  const turno = coda.then(async () => {
    const attesa = ultimaRichiesta + 1100 - Date.now();
    if (attesa > 0) await new Promise((r) => setTimeout(r, attesa));
    ultimaRichiesta = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=${encodeURIComponent(testo)}`;
      const risposta = await fetch(url, {
        headers: { 'Accept-Language': 'it', 'User-Agent': 'OnWay gestionale (richieste automatiche ai fornitori)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!risposta.ok) return null; // servizio non disponibile: si riprova al giro dopo, niente cache
      const risultati = await risposta.json() as { lat: string; lon: string }[];
      const trovato = risultati[0] ? { lat: Number(risultati[0].lat), lng: Number(risultati[0].lon) } : null;
      cache.set(chiave, trovato);
      return trovato;
    } catch (err) {
      console.error(`[geocodifica] "${testo}" non cercato:`, err instanceof Error ? err.message : err);
      return null;
    }
  });
  coda = turno.catch(() => undefined);
  return turno;
}
