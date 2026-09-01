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

/** Disegna un percorso su una cartina reale (OpenStreetMap, gratuita —
 *  stesso servizio già usato per gli indirizzi altrove), con la linea
 *  che segue DAVVERO le strade (non un segmento dritto tra un punto e
 *  l'altro) — usa lo stesso servizio OSRM già in uso per calcolare
 *  tempi/distanze, qui chiesto di restituire anche il tracciato
 *  completo invece di solo i numeri. */
export function MappaPercorso({ tappe }: { tappe: TappaMappa[] }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<L.Map | null>(null);
  const [stato, setStato] = useState<'carico' | 'pronto' | 'errore'>('carico');
  const [distanzaKm, setDistanzaKm] = useState<number | null>(null);
  const [tappeNonTrovate, setTappeNonTrovate] = useState<string[]>([]);

  useEffect(() => {
    let annullato = false;

    async function costruisci() {
      setStato('carico');
      setTappeNonTrovate([]);

      // Ogni tappa: prova prima l'indirizzo vero, se manca (le due
      // Teste possono non averlo ancora) o se non si trova, prova solo
      // la città — approssimato al centro, come deciso.
      const coordinate: (Coordinate & { etichetta: string })[] = [];
      const nonTrovate: string[] = [];
      for (const t of tappe) {
        const query = t.indirizzo?.trim() ? `${t.indirizzo}, ${t.citta}` : t.citta;
        const risultato = await geocodifica(query);
        if (risultato.coordinate) {
          coordinate.push({ ...risultato.coordinate, etichetta: t.etichetta });
        } else if (t.indirizzo?.trim()) {
          // L'indirizzo preciso non è stato trovato — ultimo tentativo
          // solo sulla città, prima di arrendersi del tutto su questa tappa.
          const soloCitta = await geocodifica(t.citta);
          if (soloCitta.coordinate) coordinate.push({ ...soloCitta.coordinate, etichetta: t.etichetta });
          else nonTrovate.push(t.etichetta);
        } else {
          nonTrovate.push(t.etichetta);
        }
      }
      if (annullato) return;
      setTappeNonTrovate(nonTrovate);

      if (coordinate.length < 2 || !contenitoreRef.current) {
        setStato('errore');
        return;
      }

      // Il tracciato vero su strada — se OSRM non risponde (rete,
      // percorso non collegabile via strada, ecc.) resta comunque un
      // segnale utile: mostriamo i marcatori con segmenti dritti tra
      // loro invece di mostrare solo un errore secco.
      const tracciato = await tracciatoPercorso(coordinate);
      if (annullato) return;

      if (!mappaRef.current) {
        mappaRef.current = L.map(contenitoreRef.current);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mappaRef.current);
      }
      const mappa = mappaRef.current;
      mappa.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) mappa.removeLayer(layer); });

      for (const c of coordinate) {
        L.marker([c.lat, c.lng]).addTo(mappa).bindPopup(c.etichetta);
      }
      const puntiLinea: [number, number][] = tracciato
        ? tracciato.tratto.map((p) => [p.lat, p.lng])
        : coordinate.map((c) => [c.lat, c.lng]); // ripiego: segmenti dritti se OSRM non risponde
      L.polyline(puntiLinea, { color: '#2563eb', weight: 4 }).addTo(mappa);
      mappa.fitBounds(L.latLngBounds(coordinate.map((c) => [c.lat, c.lng])), { padding: [30, 30] });

      setDistanzaKm(tracciato?.distanzaKm ?? null);
      setStato('pronto');
    }

    costruisci();
    return () => { annullato = true; };
  }, [tappe]);

  // La mappa Leaflet resta viva tra un aggiornamento e l'altro (non la
  // ricreiamo ogni volta, solo i marcatori/la linea sopra) — va
  // distrutta esplicitamente solo quando il componente sparisce del
  // tutto, altrimenti Leaflet perde il riferimento al contenitore DOM
  // e la mappa successiva non si disegna più.
  useEffect(() => () => { mappaRef.current?.remove(); mappaRef.current = null; }, []);

  return (
    <div>
      {stato === 'carico' && <p style={{ color: 'var(--mist)' }}>Cerco le fermate sulla cartina...</p>}
      {stato === 'errore' && <p style={{ color: 'var(--pink)' }}>Non riesco a mostrare la cartina — nessuna fermata trovata con un indirizzo o città valida.</p>}
      {tappeNonTrovate.length > 0 && (
        <p style={{ color: 'var(--amber)', fontSize: 12.5, marginBottom: 8 }}>
          Non trovate sulla cartina: {tappeNonTrovate.join(', ')}.
        </p>
      )}
      <div ref={contenitoreRef} style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }} />
      {distanzaKm !== null && <p style={{ color: 'var(--mist)', fontSize: 12.5, marginTop: 8 }}>Percorso reale: circa {distanzaKm} km.</p>}
    </div>
  );
}
