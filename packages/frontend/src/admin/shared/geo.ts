// Helper condivisi per geocodifica indirizzi e calcolo tempi di percorrenza,
// tramite servizi gratuiti OpenStreetMap (Nominatim + OSRM), senza bisogno
// di una chiave Google Maps a pagamento. Stessa logica già usata nella
// Versione 18 del prototipo.

export interface Coordinate { lat: number; lng: number; }

/** Risultato esplicito: distingue "indirizzo non trovato" da "richiesta
 *  fallita" (rete/firewall/CORS), così l'interfaccia può mostrare un
 *  messaggio utile invece di un generico "non ci sono riuscito". */
export interface RisultatoGeocodifica {
  coordinate: Coordinate | null;
  erroreRete: boolean;
}

export async function geocodifica(indirizzo: string): Promise<RisultatoGeocodifica> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(indirizzo)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!res.ok) {
      console.error('Nominatim ha risposto con errore:', res.status, res.statusText);
      return { coordinate: null, erroreRete: true };
    }
    const risultati = await res.json();
    if (risultati?.[0]) {
      return { coordinate: { lat: Number(risultati[0].lat), lng: Number(risultati[0].lon) }, erroreRete: false };
    }
    return { coordinate: null, erroreRete: false }; // richiesta riuscita, ma indirizzo non trovato
  } catch (e) {
    // Qui arrivano i problemi di rete/CORS/firewall: li stampo in console
    // per poterli diagnosticare (apri la Console del browser con F12).
    console.error('Geocodifica fallita per "' + indirizzo + '":', e);
    return { coordinate: null, erroreRete: true };
  }
}

export async function suggerimentiIndirizzo(query: string): Promise<{ label: string; lat: number; lng: number }[]> {
  if (query.trim().length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=it&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!res.ok) return [];
    const risultati = await res.json();
    return (risultati ?? []).map((r: any) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
  } catch (e) {
    console.error('Suggerimenti indirizzo falliti:', e);
    return [];
  }
}

/** Durata di viaggio in minuti tra due coordinate (OSRM, gratuito). */
export async function durataViaggio(a: Coordinate, b: Coordinate): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('OSRM ha risposto con errore:', res.status, res.statusText);
      return null;
    }
    const dati = await res.json();
    if (dati?.routes?.[0]) return Math.round(dati.routes[0].duration / 60);
    return null;
  } catch (e) {
    console.error('Calcolo durata viaggio fallito:', e);
    return null;
  }
}

export function attesa(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
