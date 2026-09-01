// Helper condivisi per geocodifica indirizzi e calcolo tempi di percorrenza,
// tramite servizi gratuiti OpenStreetMap (Nominatim + OSRM), senza bisogno
// di una chiave Google Maps a pagamento. Stessa logica già usata nella
// Versione 18 del prototipo.

export interface Coordinate { lat: number; lng: number; }

// Nominatim chiede esplicitamente di restare sotto 1 richiesta al
// secondo — con centinaia di fermate da cercare (es. tutti i percorsi
// insieme sulla cartina), senza questo limitatore le richieste
// partono una via l'altra troppo veloci e Nominatim comincia a
// rifiutarle, facendo sembrare "non trovate" anche città notissime
// come Firenze o Napoli (che di per sé si troverebbero senza problemi).
// Un'unica coda condivisa da tutte le chiamate di questo file: ogni
// nuova richiesta aspetta il proprio turno, mai più veloce di una al
// secondo, indipendentemente da quante parti del gestionale la usano
// insieme nello stesso momento.
let prossimoTurnoNominatim = 0;
async function attendiTurnoNominatim() {
  const adesso = Date.now();
  const attesa = Math.max(0, prossimoTurnoNominatim - adesso);
  prossimoTurnoNominatim = Math.max(adesso, prossimoTurnoNominatim) + 1100; // 1.1s di margine, non il minimo esatto
  if (attesa > 0) await new Promise((r) => setTimeout(r, attesa));
}

/** Risultato esplicito: distingue "indirizzo non trovato" da "richiesta
 *  fallita" (rete/firewall/CORS), così l'interfaccia può mostrare un
 *  messaggio utile invece di un generico "non ci sono riuscito". */
export interface RisultatoGeocodifica {
  coordinate: Coordinate | null;
  erroreRete: boolean;
}

// Stessa richiesta ripetuta più volte nella stessa sessione (fermate
// condivise tra più percorsi, o la stessa cartina ricaricata) non ha
// senso rifarla da capo — Nominatim chiede comunque di restare sotto 1
// richiesta al secondo, una cache qui aiuta a rispettarlo davvero.
const cacheGeocodifica = new Map<string, RisultatoGeocodifica>();

export async function geocodifica(indirizzo: string): Promise<RisultatoGeocodifica> {
  const chiave = indirizzo.trim().toLowerCase();
  const inCache = cacheGeocodifica.get(chiave);
  if (inCache) return inCache;
  try {
    await attendiTurnoNominatim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(indirizzo)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!res.ok) {
      console.error('Nominatim ha risposto con errore:', res.status, res.statusText);
      return { coordinate: null, erroreRete: true };
    }
    const risultati = await res.json();
    if (risultati?.[0]) {
      const trovato: RisultatoGeocodifica = { coordinate: { lat: Number(risultati[0].lat), lng: Number(risultati[0].lon) }, erroreRete: false };
      cacheGeocodifica.set(chiave, trovato);
      return trovato;
    }
    const nonTrovato: RisultatoGeocodifica = { coordinate: null, erroreRete: false }; // richiesta riuscita, ma indirizzo non trovato
    cacheGeocodifica.set(chiave, nonTrovato);
    return nonTrovato;
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
    await attendiTurnoNominatim();
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

/** Distanza reale strada per strada in km (non in linea d'aria) — stesso
 *  servizio OSRM già usato per la durata: la risposta contiene già
 *  entrambi i dati nella stessa chiamata, questa funzione legge solo il
 *  campo diverso. Usata per il calcolo prezzi per fermata (più lontano
 *  dall'arrivo = più caro). */
export async function distanzaViaggio(a: Coordinate, b: Coordinate): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('OSRM ha risposto con errore:', res.status, res.statusText);
      return null;
    }
    const dati = await res.json();
    if (dati?.routes?.[0]) return Math.round(dati.routes[0].distance / 1000);
    return null;
  } catch (e) {
    console.error('Calcolo distanza viaggio fallito:', e);
    return null;
  }
}

/** Il tracciato VERO su strada di un intero percorso a più tappe (non
 *  segmenti dritti tra un punto e l'altro) — stesso servizio OSRM già
 *  usato sopra, qui con "overview=full&geometries=geojson" invece di
 *  "overview=false": in più alla durata/distanza, la risposta include
 *  anche la sequenza di punti che segue davvero le strade, pensata per
 *  disegnarla su una cartina. Le tappe vanno passate nell'ordine in
 *  cui si percorrono davvero (OSRM le collega in quell'ordine, non le
 *  riordina lui). */
export interface TracciatoPercorso {
  tratto: Coordinate[]; // il percorso vero, punto per punto, per disegnarlo
  distanzaKm: number;
  minutiViaggio: number;
}
export async function tracciatoPercorso(tappe: Coordinate[]): Promise<TracciatoPercorso | null> {
  if (tappe.length < 2) return null;
  try {
    const coordinateUrl = tappe.map((t) => `${t.lng},${t.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinateUrl}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error('OSRM ha risposto con errore:', res.status, res.statusText);
      return null;
    }
    const dati = await res.json();
    const percorso = dati?.routes?.[0];
    if (!percorso?.geometry?.coordinates) return null;
    // GeoJSON usa [longitudine, latitudine] — l'ordine opposto a quello
    // che usiamo noi ovunque nel resto del gestionale (lat, poi lng).
    const tratto: Coordinate[] = percorso.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
    return { tratto, distanzaKm: Math.round(percorso.distance / 1000), minutiViaggio: Math.round(percorso.duration / 60) };
  } catch (e) {
    console.error('Calcolo tracciato percorso fallito:', e);
    return null;
  }
}

export function attesa(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
