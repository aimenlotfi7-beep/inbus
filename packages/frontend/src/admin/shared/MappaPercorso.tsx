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

/** Esegue "fn" su ogni elemento di "items", ma con al massimo "limite"
 *  chiamate in corso insieme invece che una alla volta — usata per i
 *  tracciati OSRM (a differenza di Nominatim, non ha un limite rigido
 *  di 1 richiesta al secondo da rispettare), dove farle tutte in fila
 *  su tanti percorsi insieme diventava lentissimo (quasi 50 percorsi =
 *  quasi 50 attese in sequenza). */
async function mappaConLimite<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const risultati: R[] = new Array(items.length);
  let indice = 0;
  async function worker() {
    while (indice < items.length) {
      const i = indice++;
      risultati[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return risultati;
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
 *  il popup elenca tutti quelli che ci passano.
 *
 *  In due fasi, non una sola: prima la geocodifica di TUTTE le tappe
 *  di TUTTI i percorsi (in fila, un vincolo vero di Nominatim — ma la
 *  cache rende gratis le fermate già viste), poi i tracciati OSRM di
 *  TUTTI i percorsi insieme, in parallelo limitato — molto più veloce
 *  che uno alla volta quando i percorsi sono tanti (es. quasi 50). */
export function MappaPercorso({ percorsi }: { percorsi: PercorsoMappa[] }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const mappaRef = useRef<L.Map | null>(null);
  const polilineePerPercorso = useRef<Map<string, L.Polyline>>(new Map());
  const [stato, setStato] = useState<'carico' | 'carico-tracciati' | 'pronto' | 'errore'>('carico');
  const [progresso, setProgresso] = useState<{ fatti: number; totali: number }>({ fatti: 0, totali: 0 });
  const [risultatiPerPercorso, setRisultatiPerPercorso] = useState<{ id: string; nome: string; colore: string; distanzaKm: number | null; nonTrovate: string[] }[]>([]);
  // Due concetti separati: "selezionati" è persistente, si costruisce
  // cliccando una linea (o il suo pallino in legenda) — resta finché
  // non si clicca di nuovo lo stesso (lo toglie) o si clicca fuori
  // (lo svuota tutto), permettendo di tenerne evidenziati PIÙ di uno
  // insieme, come richiesto. "hoverId" è solo un'anteprima al
  // passaggio del cursore (desktop), temporanea — si aggiunge alla
  // vista finché il cursore resta sopra, sparisce non appena esce,
  // senza toccare la selezione vera sotto.
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;

    async function costruisci() {
      setStato('carico');
      setProgresso({ fatti: 0, totali: percorsi.length });
      setSelezionati(new Set());
      setHoverId(null);
      polilineePerPercorso.current.clear();

      if (!mappaRef.current && contenitoreRef.current) {
        mappaRef.current = L.map(contenitoreRef.current);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(mappaRef.current);
        // Cliccare sulla cartina ma FUORI da una linea (sullo sfondo)
        // toglie l'evidenziazione — le linee hanno il proprio click
        // separato più sotto, che ferma la propagazione qui: i due
        // click non si "pestano" a vicenda.
        mappaRef.current.on('click', () => setSelezionati(new Set()));
      }
      const mappa = mappaRef.current;
      if (!mappa) { setStato('errore'); return; }
      mappa.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) mappa.removeLayer(layer); });

      // FASE 1 — geocodifica di ogni tappa di ogni percorso, un
      // percorso alla volta (Nominatim chiede di restare sotto 1
      // richiesta al secondo — la cache dentro geocodifica() rende
      // istantanea una fermata già vista, che con più percorsi
      // condivisi capita spessissimo, es. la stessa città di arrivo).
      const datiPerPercorso: { p: PercorsoMappa; colore: string; coordinate: (Coordinate & { etichetta: string })[]; nonTrovate: string[] }[] = [];
      for (let i = 0; i < percorsi.length; i++) {
        const p = percorsi[i];
        const colore = PALETTE[i % PALETTE.length];
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
        datiPerPercorso.push({ p, colore, coordinate, nonTrovate });
        setProgresso({ fatti: i + 1, totali: percorsi.length });
      }
      if (annullato) return;

      // FASE 2 — i tracciati stradali veri (OSRM), stavolta in
      // parallelo (limitato a 6 insieme) invece che uno alla volta:
      // OSRM non ha lo stesso vincolo rigido di Nominatim, farli tutti
      // in fila su tanti percorsi era il vero collo di bottiglia.
      setStato('carico-tracciati');
      const conAlmenoDue = datiPerPercorso
        .map((d, indiceOriginale) => ({ ...d, indiceOriginale }))
        .filter((d) => d.coordinate.length >= 2);
      const tracciati = await mappaConLimite(conAlmenoDue, 6, (d) => tracciatoPercorso(d.coordinate));
      if (annullato) return;

      // FASE 3 — disegno tutto insieme, solo ora che i dati ci sono tutti.
      const risultati: typeof risultatiPerPercorso = [];
      const fermateCondivise = new Map<string, { lat: number; lng: number; voci: string[] }>();
      const tuttiIPunti: [number, number][] = [];

      for (const d of datiPerPercorso) {
        if (d.coordinate.length < 2) {
          risultati.push({ id: d.p.id, nome: d.p.nome, colore: d.colore, distanzaKm: null, nonTrovate: d.nonTrovate });
        }
      }
      conAlmenoDue.forEach((d, idxFiltrato) => {
        const tracciato = tracciati[idxFiltrato];
        const puntiVeri: Coordinate[] = tracciato ? tracciato.tratto : d.coordinate.map((c) => ({ lat: c.lat, lng: c.lng }));
        const puntiScostati = scostaTracciato(puntiVeri, d.indiceOriginale, percorsi.length);
        const linea = L.polyline(puntiScostati.map((pt): [number, number] => [pt.lat, pt.lng]), { color: d.colore, weight: 4 }).addTo(mappa);
        // Passaggio del cursore (desktop) — evidenzia mentre resta
        // Passaggio del cursore (desktop) — anteprima temporanea,
        // sparisce appena esce, non tocca la selezione vera. Click
        // (anche da mobile, se si riesce a toccare la linea sottile) —
        // AGGIUNGE o TOGLIE dalla selezione persistente (si può
        // tenerne evidenziati più di uno insieme, cliccandone diversi
        // in sequenza), utile per guardarli con calma invece di dover
        // restare col dito sopra. "stopPropagation" evita che lo
        // stesso click arrivi anche al gestore sullo sfondo della
        // cartina, che altrimenti svuoterebbe subito la selezione
        // appena fatta.
        linea.on('mouseover', () => setHoverId(d.p.id));
        linea.on('mouseout', () => setHoverId(null));
        linea.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelezionati((prec) => {
            const nuovo = new Set(prec);
            if (nuovo.has(d.p.id)) nuovo.delete(d.p.id); else nuovo.add(d.p.id);
            return nuovo;
          });
        });
        polilineePerPercorso.current.set(d.p.id, linea);
        tuttiIPunti.push(...d.coordinate.map((c): [number, number] => [c.lat, c.lng]));

        for (const c of d.coordinate) {
          const chiave = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
          const esistente = fermateCondivise.get(chiave);
          const voce = `${d.p.nome} — ${c.etichetta}`;
          if (esistente) esistente.voci.push(voce);
          else fermateCondivise.set(chiave, { lat: c.lat, lng: c.lng, voci: [voce] });
        }

        risultati.push({ id: d.p.id, nome: d.p.nome, colore: d.colore, distanzaKm: tracciato?.distanzaKm ?? null, nonTrovate: d.nonTrovate });
      });

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

  // Ogni volta che cambia la selezione (persistente o l'anteprima al
  // passaggio del cursore): le linee scelte restano bene in vista e
  // passano sopra alle altre (bringToFront, altrimenti una linea
  // "sotto" a un'altra resterebbe nascosta anche se evidenziata),
  // tutte le altre si affievoliscono. Effetto separato dalla
  // costruzione della cartina — non serve rifare geocodifica/tracciati
  // solo per cambiare quali righe sono più in vista.
  useEffect(() => {
    const daEvidenziare = hoverId ? new Set([...selezionati, hoverId]) : selezionati;
    for (const [id, linea] of polilineePerPercorso.current) {
      if (daEvidenziare.size === 0) {
        linea.setStyle({ opacity: 1, weight: 4 });
      } else if (daEvidenziare.has(id)) {
        linea.setStyle({ opacity: 1, weight: 6 });
        linea.bringToFront();
      } else {
        linea.setStyle({ opacity: 0.15, weight: 4 });
      }
    }
  }, [selezionati, hoverId]);

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
          Cerco le fermate sulla cartina... {percorsi.length > 1 ? `(${progresso.fatti}/${progresso.totali} percorsi)` : ''}
          {percorsi.length > 5 && <><br />Con molte fermate mai cercate prima può richiedere qualche minuto (il servizio gratuito chiede di restare sotto 1 richiesta al secondo).</>}
        </p>
      )}
      {stato === 'carico-tracciati' && <p style={{ color: 'var(--mist)' }}>Fermate trovate — calcolo i tracciati stradali...</p>}
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
            <button
              key={r.id}
              type="button"
              onClick={() => setSelezionati((prec) => {
                const nuovo = new Set(prec);
                if (nuovo.has(r.id)) nuovo.delete(r.id); else nuovo.add(r.id);
                return nuovo;
              })}
              title="Evidenzia questo tragitto sulla cartina — puoi sceglierne più di uno insieme"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                color: selezionati.has(r.id) ? 'var(--paper)' : 'var(--mist)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontWeight: selezionati.has(r.id) ? 600 : 400,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.colore, flexShrink: 0 }} />
              {r.nome}{r.distanzaKm !== null ? ` — ${r.distanzaKm} km` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
