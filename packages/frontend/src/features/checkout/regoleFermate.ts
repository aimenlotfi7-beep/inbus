import { useState } from 'react';

/** Regole comuni agli elenchi di fermate del sito: la sezione Partenze
 *  della pagina evento (EventoDettaglio) e la scelta nel modulo di
 *  prenotazione (SceltaFermata). Stesse regole nei due posti, così chi
 *  trova la propria fermata in pagina la ritrova uguale nel foglio.
 *
 *  - Fino a SOGLIA_ELENCO_LUNGO fermate: elenco semplice, per orario.
 *  - Oltre: campo "Da dove parti?", "Usa la mia posizione" e fermate
 *    raggruppate per regione, chiuse (si apre la propria). */

export const SOGLIA_ELENCO_LUNGO = 8;
/** Quante fermate mostrare in "Più vicine a te". */
export const NUMERO_VICINE = 3;
export const REGIONE_ASSENTE = 'Altre fermate';

/** Quello che serve delle fermate per filtrarle, ordinarle e raggrupparle. */
export interface DatiFermata {
  citta: string;
  indirizzo: string | null;
  orario: string | null;
  regione: string | null;
  lat: number | null;
  lng: number | null;
}

/** "14:05" → 845 minuti; senza orario in fondo. */
function minuti(orario: string | null): number {
  const m = orario?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}

/** Minuscolo e senza accenti: "citta" trova anche "Città". */
export function normalizza(testo: string): string {
  return testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Per orario di partenza, cioè nell'ordine in cui passa il bus; a pari
 *  orario per città. */
export function ordinaPerOrario<T>(voci: T[], dati: (v: T) => DatiFermata): T[] {
  return [...voci].sort((a, b) => {
    const da = dati(a), db = dati(b);
    return (minuti(da.orario) - minuti(db.orario)) || da.citta.localeCompare(db.citta, 'it');
  });
}

/** Ogni parola scritta deve comparire in città, indirizzo o regione. */
export function filtraFermate<T>(voci: T[], testo: string, dati: (v: T) => DatiFermata): T[] {
  const parole = normalizza(testo).split(/\s+/).filter(Boolean);
  if (!parole.length) return voci;
  return voci.filter((v) => {
    const d = dati(v);
    const campi = normalizza(`${d.citta} ${d.indirizzo ?? ''} ${d.regione ?? ''}`);
    return parole.every((p) => campi.includes(p));
  });
}

export interface GruppoRegione<T> { regione: string; voci: T[] }

/** Gruppi per regione: regioni in ordine alfabetico (con più percorsi
 *  l'ordine "di passaggio" delle regioni mescolava i percorsi e non si
 *  capiva), fermate dentro per orario; quelle senza regione in fondo,
 *  sotto "Altre fermate". */
export function raggruppaPerRegione<T>(voci: T[], dati: (v: T) => DatiFermata): GruppoRegione<T>[] {
  const mappa = new Map<string, T[]>();
  for (const v of ordinaPerOrario(voci, dati)) {
    const chiave = dati(v).regione ?? REGIONE_ASSENTE;
    mappa.set(chiave, [...(mappa.get(chiave) ?? []), v]);
  }
  return [...mappa.entries()]
    .map(([regione, elenco]) => ({ regione, voci: elenco }))
    .sort((a, b) => {
      if (a.regione === REGIONE_ASSENTE) return 1;
      if (b.regione === REGIONE_ASSENTE) return -1;
      return a.regione.localeCompare(b.regione, 'it');
    });
}

/** Distanza in linea d'aria (km) tra due punti. */
function distanzaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Le fermate con coordinate più vicine alla posizione, con la distanza. */
export function fermatePiuVicine<T>(voci: T[], posizione: { lat: number; lng: number }, dati: (v: T) => DatiFermata, quante = NUMERO_VICINE): { voce: T; km: number }[] {
  return voci
    .map((voce) => ({ voce, d: dati(voce) }))
    .filter(({ d }) => d.lat != null && d.lng != null)
    .map(({ voce, d }) => ({ voce, km: distanzaKm(posizione.lat, posizione.lng, d.lat as number, d.lng as number) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, quante);
}

/** "a 800 m", "a 12 km" (linea d'aria, arrotondata). */
export function testoDistanza(km: number): string {
  if (km < 1) return `a ${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `a ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

export type StatoPosizione = 'inattiva' | 'in-corso' | 'trovata' | 'negata' | 'errore';

/** La posizione del cliente, chiesta solo quando preme il pulsante.
 *  Resta nel browser: serve solo a ordinare le fermate per distanza. */
export function usePosizione() {
  const [stato, setStato] = useState<StatoPosizione>('inattiva');
  const [posizione, setPosizione] = useState<{ lat: number; lng: number } | null>(null);
  const disponibile = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  function chiedi() {
    if (!disponibile) { setStato('errore'); return; }
    setStato('in-corso');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosizione({ lat: p.coords.latitude, lng: p.coords.longitude }); setStato('trovata'); },
      (e) => setStato(e.code === e.PERMISSION_DENIED ? 'negata' : 'errore'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }
  function annulla() { setPosizione(null); setStato('inattiva'); }
  return { stato, posizione, disponibile, chiedi, annulla };
}

/** Il messaggio da mostrare per lo stato della posizione (null = nessuno). */
export function messaggioPosizione(stato: StatoPosizione): string | null {
  if (stato === 'in-corso') return 'Cerco la tua posizione…';
  if (stato === 'negata') return 'Non hai dato il permesso di usare la posizione: scrivi la tua città qui sopra.';
  if (stato === 'errore') return 'Non riusciamo a trovare la tua posizione: scrivi la tua città qui sopra.';
  return null;
}
