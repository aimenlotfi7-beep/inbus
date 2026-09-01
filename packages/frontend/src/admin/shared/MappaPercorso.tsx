import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodifica, tracciatoPercorso, type Coordinate } from './geo';
import { creaPinDiamante } from './pinMappa';

export interface TappaMappa {
  etichetta: string; // testo mostrato sul marcatore (es. "Testa — Milano")
  citta: string;
  indirizzo?: string | null; // se assente/vuoto, si geocodifica solo la città (centro città, approssimato)
  // Se già note (dall'anagrafica fermate, quando questa tappa vi è
  // collegata) — evita di richiederle di nuovo per testo a Nominatim,
  // che su nomi non standard (es. "Piacenza Sud", un'uscita
  // autostradale, non un vero comune) può sbagliare paese del tutto.
  lat?: number | null;
  lng?: number | null;
}
export interface PercorsoMappa {
  id: string;
  nome: string;
  tappe: TappaMappa[];
}

// Colori ben distinguibili tra loro, uno per percorso — se i percorsi
// sono più dei colori disponibili, si ricomincia dal primo (comunque
// affiancati da nome/km nella legenda, non serve un colore unico per
// distinguerli davvero).
const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

// Un pin unico (grigio, sempre uguale) per TUTTE le fermate — non uno
// per colore di percorso, così è chiaro a colpo d'occhio "qui c'è una
// fermata" senza doverlo dedurre dal colore.
const PIN_GRIGIO = creaPinDiamante('#52525b', '#27272a');

/** Sposta un tracciato (sequenza di punti) di un piccolo margine fisso,
 *  perpendicolare alla direzione locale in ogni punto — serve a
 *  separare visivamente due percorsi che per un tratto coincidono
 *  davvero (altrimenti si disegnerebbero esattamente uno sopra
 *  l'altro, indistinguibili). Lo scostamento è fisso per TUTTA la
 *  lunghezza del percorso (scelto insieme così, invece del calcolo
 *  molto più complesso "solo dove si sovrappongono davvero") — quindi
 *  anche un percorso senza nessuna sovrapposizione risulterà spostato
 *  di pochi metri dalla strada esatta, impercettibile a occhio.
 *  "indice"/"totale" servono a centrare tutti i percorsi attorno alla
 *  posizione vera (es. con 2 percorsi: uno a -4m, l'altro a +4m). */
function scostaTracciato(punti: Coordinate[], indice: number, totale: number, metriTraLinee = 8): Coordinate[] {
  if (totale <= 1 || punti.length < 2) return punti;
  const metriOffset = (indice - (totale - 1) / 2) * metriTraLinee;
  const METRI_PER_GRADO_LAT = 111320;
  return punti.map((punto, i) => {
    const prima = punti[Math.max(0, i - 1)];
    const dopo = punti[Math.min(punti.length - 1, i + 1)];
    const dLat = dopo.lat - prima.lat;
    const dLng = dopo.lng - prima.lng;
    const lunghezza = Math.hypot(dLat, dLng) || 1;
    // Perpendicolare alla direzione locale (ruotata di 90°).
    const perpLat = -dLng / lunghezza;
    const perpLng = dLat / lunghezza;
    const metriPerGradoLng = METRI_PER_GRADO_LAT * Math.cos((punto.lat * Math.PI) / 180);
    return {
      lat: punto.lat + (perpLat * metriOffset) / METRI_PER_GRADO_LAT,
      lng: punto.lng + (perpLng * metriOffset) / metriPerGradoLng,
    };
  });
}

/** Disegna uno o più percorsi su una cartina reale (OpenStreetMap,
 *  gratuita — stesso servizio già usato per gli indirizzi altrove), con
 *  la linea che segue DAVVERO le strade (non un segmento dritto tra un
 *  punto e l'altro) — usa lo stesso servizio OSRM già in uso per
 *  calcolare tempi/distanze, qui chiesto di restituire anche il
 *  tracciato completo invece di solo i numeri. Con più percorsi
 *  insieme, ognuno prende un colore diverso (vedi PALETTE) e le linee
 *  che coincidono per un tratto si scostano leggermente per restare
 *  distinguibili (vedi scostaTracciato). Le fermate hanno tutte lo
 *  stesso pin grigio — se più percorsi condividono la stessa fermata,
 *  il popup elenca tutti quelli che ci passano. */
export function MappaPercorso({ percorsi }: { percorsi: PercorsoMappa[] }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<L.Map | null>(null);
  const [stato, setStato] = useState<'carico' | 'pronto' | 'errore'>('carico');
  const [progresso, setProgresso] = useState<{ fatti: number; totali: number }>({ fatti: 0, totali: 0 });
  const [risultatiPerPercorso, setRisultatiPerPercorso] = useState<{ id: string; nome: string; colore: string; distanzaKm: number | null; nonTrovate: string[] }[]>([]);

  useEffect(() => {
    let annullato = false;

    async function costruisci() {
      setStato('carico');
      setProgresso({ fatti: 0, totali: percorsi.length });
      const risultati: { id: string; nome: string; colore: string; distanzaKm: number | null; nonTrovate: string[] }[] = [];
      // Una fermata nello stesso punto esatto (es. "Milano" condivisa da
      // più percorsi — la cache di geocodifica() garantisce le stesse
      // coordinate identiche) diventa UN solo pin, con tutti i percorsi
      // che ci passano elencati nello stesso popup — invece di pin
      // impilati uno sopra l'altro, indistinguibili.
      const fermateCondivise = new Map<string, { lat: number; lng: number; voci: string[] }>();

      if (!mappaRef.current && contenitoreRef.current) {
        mappaRef.current = L.map(contenitoreRef.current);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mappaRef.current);
      }
      const mappa = mappaRef.current;
      if (!mappa) { setStato('errore'); return; }
      mappa.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) mappa.removeLayer(layer); });

      const tuttiIPunti: [number, number][] = [];

      for (let i = 0; i < percorsi.length; i++) {
        const p = percorsi[i];
        const colore = PALETTE[i % PALETTE.length];

        // Ogni tappa: prova prima l'indirizzo vero, se manca (le due
        // Teste possono non averlo ancora) o se non si trova, prova
        // solo la città — approssimato al centro, come deciso. La
        // cache dentro geocodifica() evita di richiedere di nuovo una
        // fermata già cercata per un percorso precedente in questo
        // stesso giro (es. la stessa città di partenza condivisa da
        // più percorsi) — e fa sì che due percorsi con la stessa
        // fermata ottengano ESATTAMENTE le stesse coordinate, non due
        // leggermente diverse, altrimenti non si raggrupperebbero.
        const coordinate: (Coordinate & { etichetta: string })[] = [];
        const nonTrovate: string[] = [];
        for (const t of p.tappe) {
          if (t.lat != null && t.lng != null) {
            coordinate.push({ lat: t.lat, lng: t.lng, etichetta: t.etichetta });
            continue;
          }
          const query = t.indirizzo?.trim() ? `${t.indirizzo}, ${t.citta}` : t.citta;
          const risultato = await geocodifica(query);
          if (risultato.coordinate) {
            coordinate.push({ ...risultato.coordinate, etichetta: t.etichetta });
          } else if (t.indirizzo?.trim()) {
            const soloCitta = await geocodifica(t.citta);
            if (soloCitta.coordinate) coordinate.push({ ...soloCitta.coordinate, etichetta: t.etichetta });
            else nonTrovate.push(t.etichetta);
          } else {
            nonTrovate.push(t.etichetta);
          }
        }
        if (annullato) return;

        for (const c of coordinate) {
          const chiave = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
          const esistente = fermateCondivise.get(chiave);
          const voce = `${p.nome} — ${c.etichetta}`;
          if (esistente) esistente.voci.push(voce);
          else fermateCondivise.set(chiave, { lat: c.lat, lng: c.lng, voci: [voce] });
        }

        if (coordinate.length < 2) {
          risultati.push({ id: p.id, nome: p.nome, colore, distanzaKm: null, nonTrovate });
          setProgresso({ fatti: i + 1, totali: percorsi.length });
          continue;
        }

        const tracciato = await tracciatoPercorso(coordinate);
        if (annullato) return;

        const puntiVeri: Coordinate[] = tracciato
          ? tracciato.tratto
          : coordinate.map((c) => ({ lat: c.lat, lng: c.lng })); // ripiego: segmenti dritti se OSRM non risponde
        const puntiScostati = scostaTracciato(puntiVeri, i, percorsi.length);
        L.polyline(puntiScostati.map((pt): [number, number] => [pt.lat, pt.lng]), { color: colore, weight: 4 }).addTo(mappa);
        tuttiIPunti.push(...coordinate.map((c): [number, number] => [c.lat, c.lng]));

        risultati.push({ id: p.id, nome: p.nome, colore, distanzaKm: tracciato?.distanzaKm ?? null, nonTrovate });
        setProgresso({ fatti: i + 1, totali: percorsi.length });
      }

      if (annullato) return;

      for (const f of fermateCondivise.values()) {
        L.marker([f.lat, f.lng], { icon: PIN_GRIGIO }).addTo(mappa).bindPopup(f.voci.map((v) => `• ${v}`).join('<br>'));
      }

      if (tuttiIPunti.length === 0) {
        setStato('errore');
        return;
      }
      mappa.fitBounds(L.latLngBounds(tuttiIPunti), { padding: [30, 30] });
      setRisultatiPerPercorso(risultati);
      setStato('pronto');
    }

    costruisci();
    return () => { annullato = true; };
  }, [percorsi]);

  // La mappa Leaflet resta viva tra un aggiornamento e l'altro (non la
  // ricreiamo ogni volta, solo i marcatori/le linee sopra) — va
  // distrutta esplicitamente solo quando il componente sparisce del
  // tutto, altrimenti Leaflet perde il riferimento al contenitore DOM
  // e la mappa successiva non si disegna più.
  useEffect(() => () => { mappaRef.current?.remove(); mappaRef.current = null; }, []);

  const tappeNonTrovateTotali = risultatiPerPercorso.flatMap((r) => r.nonTrovate.map((t) => `${r.nome}: ${t}`));

  return (
    <div>
      {stato === 'carico' && (
        <p style={{ color: 'var(--mist)' }}>
          Cerco le fermate sulla cartina... {progresso.totali > 1 ? `(${progresso.fatti}/${progresso.totali} percorsi)` : ''}
        </p>
      )}
      {stato === 'errore' && <p style={{ color: 'var(--pink)' }}>Non riesco a mostrare la cartina — nessuna fermata trovata con un indirizzo o città valida.</p>}
      {tappeNonTrovateTotali.length > 0 && (
        <p style={{ color: 'var(--amber)', fontSize: 12.5, marginBottom: 8 }}>
          Non trovate sulla cartina: {tappeNonTrovateTotali.join(', ')}.
        </p>
      )}
      <div ref={contenitoreRef} style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }} />
      {risultatiPerPercorso.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
          {risultatiPerPercorso.map((r) => (
            <span key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--mist)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.colore, flexShrink: 0 }} />
              {r.nome}{r.distanzaKm !== null ? ` — ${r.distanzaKm} km` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
