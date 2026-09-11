import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodifica } from './geo';
import { creaPinDiamante } from './pinMappa';
import { aggiungiSfondoMappa } from './sfondoMappa';

export interface PuntoMappa {
  id: string;
  etichetta: string; // testo mostrato nel popup (es. nome del fornitore)
  sottotitolo?: string; // seconda riga nel popup (es. la regione)
  citta: string;
  indirizzo: string;
  lat: number | null; // se già note, non serve geocodificare
  lng: number | null;
}

const PIN = creaPinDiamante('#2563eb', '#1e3a8a');

/** Cartina generica con una lista di punti — senza nessuna
 *  classificazione "testa di linea" (quella è solo per le Fermate,
 *  vedi MappaPuntiFermate): qui ogni punto ha lo stesso colore, un
 *  singolo pin, solo per vedere DOVE sono nel mondo. Usa lat/lng già
 *  note quando ci sono, geocodifica solo quelle senza. */
export function MappaPunti({ punti }: { punti: PuntoMappa[] }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<L.Map | null>(null);
  const [stato, setStato] = useState<'carico' | 'pronto' | 'errore'>('carico');
  const [nonTrovati, setNonTrovati] = useState<string[]>([]);

  useEffect(() => {
    let annullato = false;

    async function costruisci() {
      setStato('carico');
      setNonTrovati([]);

      if (!mappaRef.current && contenitoreRef.current) {
        mappaRef.current = L.map(contenitoreRef.current);
        aggiungiSfondoMappa(mappaRef.current);
      }
      const mappa = mappaRef.current;
      if (!mappa) { setStato('errore'); return; }
      mappa.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) mappa.removeLayer(layer); });

      const tuttiIPunti: [number, number][] = [];
      const mancanti: string[] = [];

      for (const p of punti) {
        let lat = p.lat;
        let lng = p.lng;
        if (lat === null || lng === null) {
          const risultato = await geocodifica(`${p.indirizzo}, ${p.citta}`);
          if (risultato.coordinate) {
            lat = risultato.coordinate.lat;
            lng = risultato.coordinate.lng;
          } else {
            const soloCitta = await geocodifica(p.citta);
            if (soloCitta.coordinate) { lat = soloCitta.coordinate.lat; lng = soloCitta.coordinate.lng; }
          }
        }
        if (annullato) return;
        if (lat === null || lng === null) { mancanti.push(p.etichetta); continue; }

        L.marker([lat, lng], { icon: PIN }).addTo(mappa).bindPopup(`<b>${p.etichetta}</b>${p.sottotitolo ? `<br>${p.sottotitolo}` : ''}`);
        tuttiIPunti.push([lat, lng]);
      }

      if (annullato) return;
      setNonTrovati(mancanti);

      if (tuttiIPunti.length === 0) {
        setStato('errore');
        return;
      }
      mappa.fitBounds(L.latLngBounds(tuttiIPunti), { padding: [30, 30] });
      setStato('pronto');
    }

    costruisci();
    return () => { annullato = true; };
  }, [punti]);

  useEffect(() => () => { mappaRef.current?.remove(); mappaRef.current = null; }, []);

  return (
    <div>
      {stato === 'carico' && <p style={{ color: 'var(--mist)' }}>Cerco i punti sulla cartina...</p>}
      {stato === 'errore' && <p style={{ color: 'var(--pink)' }}>Non riesco a mostrare la cartina — nessun punto trovato con un indirizzo o città valida.</p>}
      {nonTrovati.length > 0 && (
        <p style={{ color: 'var(--amber)', fontSize: 'var(--testo-md)', marginBottom: 8 }}>Non trovati sulla cartina: {nonTrovati.join(', ')}.</p>
      )}
      <div ref={contenitoreRef} style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }} />
    </div>
  );
}
