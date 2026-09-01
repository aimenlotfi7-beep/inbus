import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocodifica } from './geo';
import { creaPinDiamante } from './pinMappa';

export type CategoriaTesta = 'sempre' | 'mai' | 'a-volte';

export interface PuntoFermataMappa {
  id: string;
  etichetta: string; // testo mostrato nel popup (es. "Milano — Piazza Duomo")
  citta: string;
  indirizzo: string;
  lat: number | null; // se già presente in anagrafica, non serve geocodificare
  lng: number | null;
  categoria: CategoriaTesta;
}

const COLORI: Record<CategoriaTesta, { fill: string; bordo: string; etichetta: string }> = {
  sempre: { fill: '#2563eb', bordo: '#1e3a8a', etichetta: 'Sempre Testa (partenza o arrivo)' },
  'a-volte': { fill: '#d97706', bordo: '#78350f', etichetta: 'A volte Testa, a volte intermedia' },
  mai: { fill: '#52525b', bordo: '#27272a', etichetta: 'Mai Testa (solo intermedia, o non ancora usata)' },
};
const PIN: Record<CategoriaTesta, L.DivIcon> = {
  sempre: creaPinDiamante(COLORI.sempre.fill, COLORI.sempre.bordo),
  'a-volte': creaPinDiamante(COLORI['a-volte'].fill, COLORI['a-volte'].bordo),
  mai: creaPinDiamante(COLORI.mai.fill, COLORI.mai.bordo),
};

/** Cartina con TUTTE le fermate dell'anagrafica come punti — non un
 *  percorso, solo dove sono nel mondo, colorate secondo se sono usate
 *  come Testa (partenza/arrivo) in un Percorso Salvato: sempre, mai, o
 *  a volte sì e a volte no (compare come intermedia in un percorso e
 *  come Testa in un altro) — capibile solo incrociando tutti i
 *  Percorsi Salvati, la classificazione arriva già pronta dal
 *  chiamante (vedi FermateScreen). Usa lat/lng già salvate
 *  sull'anagrafica quando ci sono, geocodifica solo quelle senza. */
export function MappaPuntiFermate({ punti }: { punti: PuntoFermataMappa[] }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<L.Map | null>(null);
  const [stato, setStato] = useState<'carico' | 'pronto' | 'errore'>('carico');
  const [nonTrovate, setNonTrovate] = useState<string[]>([]);

  useEffect(() => {
    let annullato = false;

    async function costruisci() {
      setStato('carico');
      setNonTrovate([]);

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

        L.marker([lat, lng], { icon: PIN[p.categoria] }).addTo(mappa).bindPopup(`<b>${p.etichetta}</b><br>${COLORI[p.categoria].etichetta}`);
        tuttiIPunti.push([lat, lng]);
      }

      if (annullato) return;
      setNonTrovate(mancanti);

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
      {stato === 'carico' && <p style={{ color: 'var(--mist)' }}>Cerco le fermate sulla cartina...</p>}
      {stato === 'errore' && <p style={{ color: 'var(--pink)' }}>Non riesco a mostrare la cartina — nessuna fermata trovata con un indirizzo o città valida.</p>}
      {nonTrovate.length > 0 && (
        <p style={{ color: 'var(--amber)', fontSize: 12.5, marginBottom: 8 }}>Non trovate sulla cartina: {nonTrovate.join(', ')}.</p>
      )}
      <div ref={contenitoreRef} style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
        {(Object.keys(COLORI) as CategoriaTesta[]).map((c) => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--mist)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORI[c].fill, flexShrink: 0 }} />
            {COLORI[c].etichetta}
          </span>
        ))}
      </div>
    </div>
  );
}
