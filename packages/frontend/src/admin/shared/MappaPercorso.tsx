import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodifica, tracciatoPercorso, type Coordinate } from './geo';

// Leaflet cerca le icone dei marcatori come file separati — nel nostro
// bundle (Vite) i percorsi di default non si risolvono da soli, motivo
// per cui senza questo la mappa mostrerebbe marcatori "rotti" (icona
// mancante, solo l'ombra). Le puntiamo esplicitamente a un CDN pubblico.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface TappaMappa {
  etichetta: string; // testo mostrato sul marcatore (es. "Testa — Milano")
  citta: string;
  indirizzo?: string | null; // se assente/vuoto, si geocodifica solo la città (centro città, approssimato)
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

/** Disegna uno o più percorsi su una cartina reale (OpenStreetMap,
 *  gratuita — stesso servizio già usato per gli indirizzi altrove), con
 *  la linea che segue DAVVERO le strade (non un segmento dritto tra un
 *  punto e l'altro) — usa lo stesso servizio OSRM già in uso per
 *  calcolare tempi/distanze, qui chiesto di restituire anche il
 *  tracciato completo invece di solo i numeri. Con più percorsi
 *  insieme, ognuno prende un colore diverso (vedi PALETTE) — utile per
 *  vedere a colpo d'occhio come si sovrappongono/completano a vicenda. */
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
        // più percorsi).
        const coordinate: (Coordinate & { etichetta: string })[] = [];
        const nonTrovate: string[] = [];
        for (const t of p.tappe) {
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

        if (coordinate.length < 2) {
          risultati.push({ id: p.id, nome: p.nome, colore, distanzaKm: null, nonTrovate });
          setProgresso({ fatti: i + 1, totali: percorsi.length });
          continue;
        }

        const tracciato = await tracciatoPercorso(coordinate);
        if (annullato) return;

        for (const c of coordinate) {
          L.circleMarker([c.lat, c.lng], { radius: 6, color: colore, fillColor: colore, fillOpacity: 0.9, weight: 2 })
            .addTo(mappa)
            .bindPopup(`<b>${p.nome}</b><br>${c.etichetta}`);
        }
        const puntiLinea: [number, number][] = tracciato
          ? tracciato.tratto.map((pt) => [pt.lat, pt.lng])
          : coordinate.map((c) => [c.lat, c.lng]); // ripiego: segmenti dritti se OSRM non risponde
        L.polyline(puntiLinea, { color: colore, weight: 4 }).addTo(mappa);
        tuttiIPunti.push(...coordinate.map((c): [number, number] => [c.lat, c.lng]));

        risultati.push({ id: p.id, nome: p.nome, colore, distanzaKm: tracciato?.distanzaKm ?? null, nonTrovate });
        setProgresso({ fatti: i + 1, totali: percorsi.length });
      }

      if (annullato) return;
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
