import {
  useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent as EventoTastiera, type PointerEvent as EventoPuntatore, type ReactNode, type SVGProps,
} from 'react';
import { plurale } from '../../../shared/formato';
import { formattaNumero, formattaPercentuale, pluraleNumero } from './comuni';

/** Grafici delle Statistiche, fatti a mano in SVG (nessuna libreria nel
 *  progetto). Regole comuni: una scala per grafico con tacche tonde
 *  (1, 2, 5 × 10^k); testi a 11px dentro il viewBox, grigi, i valori forti
 *  scuri; griglia sottile var(--line); serie principale blu, confronto
 *  grigio tratteggiato (--stat-confronto), riferimenti ambra. Il viewBox
 *  prende la larghezza vera del contenitore, così i testi restano a 11px
 *  anche su telefono. Passando sopra un grafico (o con le frecce dopo averlo
 *  raggiunto con Tab) compare accanto alla linea verticale un riquadro con i
 *  valori, ripetuto in una zona nascosta per i lettori di schermo. */

const GRIGIO_CONFRONTO = 'var(--stat-confronto)';
const TESTO_PX = 11;
const LARGHEZZA_MINIMA = 240;
/** Larghezza massima del riquadro dei valori, bordo compreso (vedi .stat-suggerimento). */
const LARGHEZZA_SUGGERIMENTO = 222;
const COLORI_DIVISA = ['var(--blue)', 'color-mix(in srgb, var(--blue) 40%, var(--dusk))', GRIGIO_CONFRONTO];

/** Larghezza stimata di un testo a 11px, per tenere le etichette dentro il viewBox. */
function larghezzaTesto(testo: string): number {
  return testo.length * 6.6;
}

function xSicura(x: number, testo: string, larghezza: number): number {
  const meta = larghezzaTesto(testo) / 2 + 2;
  return Math.min(Math.max(x, meta), larghezza - meta);
}

function useLarghezza() {
  const ref = useRef<HTMLDivElement>(null);
  const [larghezza, setLarghezza] = useState(640);
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const misura = () => {
      const w = Math.floor(elemento.getBoundingClientRect().width);
      if (w > 0) setLarghezza(w);
    };
    misura();
    if (typeof ResizeObserver === 'undefined') return;
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(elemento);
    return () => osservatore.disconnect();
  }, []);
  return { ref, larghezza: Math.max(LARGHEZZA_MINIMA, larghezza) };
}

/** Passo tondo (1, 2, 5 × 10^k), mai sotto 1: sull'asse ci sono conteggi. */
export function passoRotondo(grezzo: number): number {
  if (!(grezzo > 0)) return 1;
  const potenza = 10 ** Math.floor(Math.log10(grezzo));
  const n = grezzo / potenza;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * potenza);
}

export function scalaRotonda(massimo: number, tacche = 4): { cima: number; valori: number[] } {
  if (!(massimo > 0)) return { cima: 1, valori: [0, 1] };
  const passo = passoRotondo(massimo / tacche);
  const passi = Math.max(1, Math.ceil(massimo / passo - 1e-9));
  return { cima: passi * passo, valori: Array.from({ length: passi + 1 }, (_, i) => i * passo) };
}

/** Linea che si interrompe dove il valore manca (null). */
function percorsoLinea(xs: number[], valori: (number | null | undefined)[], y: (v: number) => number): string {
  let d = '';
  let aperto = false;
  for (let i = 0; i < xs.length; i++) {
    const v = valori[i];
    if (v === null || v === undefined) {
      aperto = false;
      continue;
    }
    d += `${aperto ? 'L' : 'M'}${xs[i].toFixed(1)} ${y(v).toFixed(1)} `;
    aperto = true;
  }
  return d.trim();
}

/** Colonna con l'estremo arrotondato (4px) e la base dritta. */
function pathColonna(x: number, cima: number, larghezza: number, base: number): string {
  const altezza = base - cima;
  if (altezza <= 0) return '';
  const r = Math.min(4, larghezza / 2, altezza);
  return `M${x} ${base}V${cima + r}Q${x} ${cima} ${x + r} ${cima}H${x + larghezza - r}Q${x + larghezza} ${cima} ${x + larghezza} ${cima + r}V${base}Z`;
}

/** Quali etichette dell'asse X scrivere: al massimo 8, mai sovrapposte. */
function indiciEtichette(n: number, larghezzaArea: number, larghezzaEtichetta: number): number[] {
  if (n <= 0) return [];
  const massimo = Math.min(8, Math.floor(larghezzaArea / (larghezzaEtichetta + 16)) + 1);
  if (n <= massimo) return Array.from({ length: n }, (_, i) => i);
  if (massimo < 2) return [0];
  const passo = Math.ceil((n - 1) / (massimo - 1));
  const indici: number[] = [];
  for (let i = 0; i < n; i += passo) indici.push(i);
  return indici;
}

function margineSinistro(valori: number[]): number {
  return Math.ceil(Math.max(0, ...valori.map((v) => larghezzaTesto(formattaNumero(v))))) + 12;
}

function siIncrociano(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Punto più vicino al puntatore (o scelto con le frecce), per il riquadro dei valori. */
function useCursore(xs: number[], larghezza: number) {
  const [indice, setIndice] = useState<number | null>(null);
  const n = xs.length;
  const scegli = (e: EventoPuntatore<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (n === 0 || r.width <= 0) return;
    const px = ((e.clientX - r.left) / r.width) * larghezza;
    let migliore = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[migliore] - px)) migliore = i;
    setIndice(migliore);
  };
  const props: SVGProps<SVGSVGElement> = n === 0 ? {} : {
    tabIndex: 0,
    onPointerMove: scegli,
    onPointerDown: scegli,
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setIndice(null); },
    onFocus: () => setIndice((i) => i ?? n - 1),
    onBlur: () => setIndice(null),
    onKeyDown: (e: EventoTastiera<SVGSVGElement>) => {
      if (e.key === 'Escape') { setIndice(null); return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const passo = e.key === 'ArrowRight' ? 1 : -1;
      setIndice((i) => Math.min(n - 1, Math.max(0, (i ?? (passo > 0 ? -1 : n)) + passo)));
    },
  };
  return { indice: indice !== null && indice < n ? indice : null, props };
}

interface RigaSuggerimento { chiave?: ReactNode; valore: string; nome?: string }

function testoSuggerimento(titolo: string, righe: RigaSuggerimento[]): string {
  return `${titolo}: ${righe.map((r) => (r.nome ? `${r.nome} ${r.valore}` : r.valore)).join(', ')}`;
}

/** Altezza stimata del riquadro (titolo più righe), per non coprire le etichette. */
function altezzaSuggerimento(righe: number): number {
  return 22 + 17 * (righe + 1);
}

/** Riquadro dei valori accanto alla linea verticale, dal lato con più spazio;
 *  `sopra` è la distanza in pixel dall'alto del grafico. */
function Suggerimento({ x, sopra, larghezza, titolo, righe }: {
  x: number;
  sopra: number;
  larghezza: number;
  titolo: string;
  righe: RigaSuggerimento[];
}) {
  const limite = `calc(100% - ${LARGHEZZA_SUGGERIMENTO}px)`;
  const posizione: CSSProperties = x < larghezza / 2
    ? { top: sopra, left: `max(0px, min(${Math.round(x + 12)}px, ${limite}))` }
    : { top: sopra, right: `max(0px, min(${Math.round(larghezza - x + 12)}px, ${limite}))` };
  return (
    <div className="stat-suggerimento" style={posizione} aria-hidden="true">
      <div className="stat-suggerimento-titolo">{titolo}</div>
      {righe.map((r, i) => (
        <div key={i} className="stat-suggerimento-riga">
          {r.chiave}
          <b>{r.valore}</b>
          {r.nome && <span>{r.nome}</span>}
        </div>
      ))}
    </div>
  );
}

/** Copia nascosta del riquadro per i lettori di schermo: sempre presente, così
 *  ogni cambio di punto viene letto. */
function Annuncio({ testo }: { testo: string }) {
  return <div className="stat-solo-lettori" aria-live="polite">{testo}</div>;
}

/** Pezzetto di linea per legenda e riquadro: com'è disegnata la serie. */
export function ChiaveLinea({ stile }: { stile: 'pieno' | 'tratteggio' | 'puntini' }) {
  const colore = stile === 'pieno' ? 'var(--blue)' : stile === 'tratteggio' ? GRIGIO_CONFRONTO : 'var(--amber)';
  return (
    <svg className="stat-chiave-linea" width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
      <line
        x1="2" y1="4" x2="16" y2="4" stroke={colore} strokeWidth="2"
        strokeDasharray={stile === 'tratteggio' ? '5 3' : stile === 'puntini' ? '1 4' : undefined}
        strokeLinecap={stile === 'tratteggio' ? 'butt' : 'round'}
      />
    </svg>
  );
}

function Legenda({ voci }: { voci: { chiave: ReactNode; nome: string }[] }) {
  if (voci.length < 2) return null;
  return (
    <div className="stat-legenda">
      {voci.map((v) => <span key={v.nome} className="stat-legenda-voce">{v.chiave}{v.nome}</span>)}
    </div>
  );
}

function Punto({ x, y, colore }: { x: number; y: number; colore: string }) {
  return <circle cx={x} cy={y} r={4} fill={colore} stroke="var(--dusk)" strokeWidth={2} />;
}

function AsseY({ valori, y, sinistra, destra }: { valori: number[]; y: (v: number) => number; sinistra: number; destra: number }) {
  return (
    <g>
      {valori.map((v) => {
        const yy = Math.round(y(v)) + 0.5;
        return (
          <g key={v}>
            <line x1={sinistra} x2={destra} y1={yy} y2={yy} stroke="var(--line)" strokeWidth={1} />
            <text x={sinistra - 8} y={yy + 4} textAnchor="end" fontSize={TESTO_PX} fill="var(--mist)">{formattaNumero(v)}</text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------- Andamento nel tempo

export function GraficoAndamento({ etichette, attuale, precedente, nomeAttuale, nomePrecedente, ariaLabel, altezza = 220 }: {
  etichette: string[];
  attuale: number[];
  /** null (o tutti null) = confronto spento. */
  precedente: (number | null)[] | null;
  nomeAttuale: string;
  nomePrecedente: string;
  ariaLabel: string;
  altezza?: number;
}) {
  const { ref, larghezza } = useLarghezza();
  const n = Math.min(etichette.length, attuale.length);
  const serie = attuale.slice(0, n);
  const confronto = (precedente ?? []).slice(0, n);
  const conConfronto = confronto.some((v) => v !== null && v !== undefined);
  const massimo = Math.max(0, ...serie, ...confronto.map((v) => v ?? 0));
  const scala = scalaRotonda(massimo);
  const M = { sopra: 12, destra: 16, sotto: 28, sinistra: margineSinistro(scala.valori) };
  const areaL = Math.max(20, larghezza - M.sinistra - M.destra);
  const base = altezza - M.sotto;
  const areaA = base - M.sopra;
  const xs = serie.map((_, i) => M.sinistra + (n === 1 ? areaL / 2 : (i / (n - 1)) * areaL));
  const y = (v: number) => base - (v / scala.cima) * areaA;
  const cursore = useCursore(xs, larghezza);
  const i = cursore.indice;

  if (n === 0 || massimo <= 0) {
    return <div className="stat-grafico" ref={ref}><p className="stat-vuoto">Nessun dato nel periodo.</p></div>;
  }

  const linea = percorsoLinea(xs, serie, y);
  const ultimo = n - 1;
  const etichetteX = indiciEtichette(n, areaL, Math.max(24, ...etichette.slice(0, n).map(larghezzaTesto)));
  const righe: RigaSuggerimento[] = i === null ? [] : [
    { chiave: <ChiaveLinea stile="pieno" />, valore: formattaNumero(serie[i]), nome: nomeAttuale },
    ...(conConfronto
      ? [{ chiave: <ChiaveLinea stile="tratteggio" />, valore: confronto[i] == null ? '—' : formattaNumero(confronto[i] ?? 0), nome: nomePrecedente }]
      : []),
  ];

  return (
    <div className="stat-grafico" ref={ref}>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={ariaLabel} {...cursore.props}>
        <AsseY valori={scala.valori} y={y} sinistra={M.sinistra} destra={larghezza - M.destra} />
        {n > 1 && (
          <path d={`${linea} L${xs[ultimo].toFixed(1)} ${base} L${xs[0].toFixed(1)} ${base} Z`} fill="var(--blue)" fillOpacity={0.1} stroke="none" />
        )}
        {conConfronto && (
          <path d={percorsoLinea(xs, confronto, y)} fill="none" stroke={GRIGIO_CONFRONTO} strokeWidth={2} strokeDasharray="5 4" />
        )}
        <path d={linea} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {i !== null && <line x1={xs[i]} x2={xs[i]} y1={M.sopra} y2={base} stroke="var(--mist)" strokeOpacity={0.5} strokeWidth={1} />}
        {i !== null && conConfronto && confronto[i] != null && <Punto x={xs[i]} y={y(confronto[i] ?? 0)} colore={GRIGIO_CONFRONTO} />}
        <Punto x={xs[i ?? ultimo]} y={y(serie[i ?? ultimo])} colore="var(--blue)" />
        {etichetteX.map((k) => (
          <text key={k} x={xSicura(xs[k], etichette[k], larghezza)} y={altezza - 8} textAnchor="middle" fontSize={TESTO_PX} fill="var(--mist)">
            {etichette[k]}
          </text>
        ))}
      </svg>
      {i !== null && <Suggerimento x={xs[i]} sopra={M.sopra + 2} larghezza={larghezza} titolo={etichette[i]} righe={righe} />}
      <Annuncio testo={i === null ? '' : testoSuggerimento(etichette[i], righe)} />
      {conConfronto && (
        <Legenda voci={[
          { chiave: <ChiaveLinea stile="pieno" />, nome: nomeAttuale },
          { chiave: <ChiaveLinea stile="tratteggio" />, nome: nomePrecedente },
        ]} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Ritmo di vendita di un evento

function etichettaGiorni(g: number): string {
  return g === 0 ? 'partenza' : plurale(g, 'giorno', 'giorni');
}

export function GraficoRitmo({ giorni, evento, simili, posti, oggi, testoVuoto = 'Nessun dato nel periodo.', altezza = 240 }: {
  /** Giorni alla partenza, dal più lontano a 0. */
  giorni: number[];
  evento: (number | null)[];
  simili: (number | null)[];
  posti: number;
  oggi: number | null;
  testoVuoto?: string;
  altezza?: number;
}) {
  const { ref, larghezza } = useLarghezza();
  const n = giorni.length;
  const serie = evento.slice(0, n);
  const media = simili.slice(0, n);
  const conSimili = media.some((v) => v !== null && v !== undefined);
  const massimo = Math.max(0, posti, ...serie.map((v) => v ?? 0), ...media.map((v) => v ?? 0));
  const scala = scalaRotonda(massimo);
  const M = { sopra: 22, destra: 16, sotto: 28, sinistra: margineSinistro(scala.valori) };
  const areaL = Math.max(20, larghezza - M.sinistra - M.destra);
  const base = altezza - M.sotto;
  const areaA = base - M.sopra;
  const primo = Math.max(0, giorni[0] ?? 0);
  const xDi = (g: number) => (primo <= 0 ? M.sinistra + areaL / 2 : M.sinistra + ((primo - g) / primo) * areaL);
  const xs = giorni.map(xDi);
  const y = (v: number) => base - (v / scala.cima) * areaA;
  const cursore = useCursore(xs, larghezza);
  const i = cursore.indice;

  if (n === 0 || massimo <= 0) {
    return <div className="stat-grafico" ref={ref}><p className="stat-vuoto">{testoVuoto}</p></div>;
  }

  let ultimo = -1;
  serie.forEach((v, k) => {
    if (v !== null && v !== undefined) ultimo = k;
  });

  // Asse X: dal giorno più lontano (a sinistra) alla partenza (a destra).
  const larghezzaEt = Math.max(larghezzaTesto(etichettaGiorni(primo)), larghezzaTesto('partenza')) + 16;
  const maxEtichette = Math.max(2, Math.min(8, Math.floor(areaL / larghezzaEt) + 1));
  const passoGiorni = passoRotondo(primo / (maxEtichette - 1));
  const taccheX: number[] = [];
  for (let g = Math.floor(primo / passoGiorni) * passoGiorni; g >= 0; g -= passoGiorni) taccheX.push(g);

  const xOggi = oggi !== null && oggi >= 0 && oggi <= primo ? xDi(oggi) : null;
  const testoPosti = `${pluraleNumero(posti, 'posto', 'posti')} sui bus`;
  const larghezzaTestoPosti = larghezzaTesto(testoPosti);
  const yPosti = Math.round(y(posti)) + 0.5;
  // L'etichetta dei posti va dal lato opposto a "oggi", per non sovrapporsi.
  const postiASinistra = !(xOggi !== null && xOggi < M.sinistra + larghezzaTestoPosti + 24);
  const puntoEvento = i !== null ? (serie[i] != null ? i : null) : ultimo >= 0 ? ultimo : null;

  const parti: string[] = [];
  if (ultimo >= 0) {
    const g = giorni[ultimo];
    const quando = g === 0 ? 'il giorno della partenza' : `a ${plurale(g, 'giorno', 'giorni')} dalla partenza`;
    parti.push(`${pluraleNumero(Math.round(serie[ultimo] ?? 0), 'passeggero', 'passeggeri')} ${quando}`);
    const m = media[ultimo];
    if (m !== null && m !== undefined) parti.push(`media degli eventi simili allo stesso punto ${formattaNumero(m)}`);
  }
  if (posti > 0) parti.push(testoPosti);
  const descrizione = `Ritmo di vendita${parti.length > 0 ? `: ${parti.join('; ')}` : ''}.`;

  const titoloSuggerimento = i === null ? '' : giorni[i] === 0 ? 'Giorno della partenza' : `${plurale(giorni[i], 'giorno', 'giorni')} alla partenza`;
  const righe: RigaSuggerimento[] = i === null ? [] : [
    { chiave: <ChiaveLinea stile="pieno" />, valore: serie[i] == null ? '—' : formattaNumero(serie[i] ?? 0), nome: 'Questo evento' },
    ...(conSimili
      ? [{ chiave: <ChiaveLinea stile="tratteggio" />, valore: media[i] == null ? '—' : formattaNumero(media[i] ?? 0), nome: 'Media eventi simili' }]
      : []),
    ...(posti > 0 ? [{ chiave: <ChiaveLinea stile="puntini" />, valore: formattaNumero(posti), nome: 'Posti sui bus' }] : []),
  ];
  // Il riquadro sta in alto, sotto l'etichetta "oggi"; se lì coprirebbe
  // l'etichetta dei posti, scende in fondo al grafico.
  let sopraSuggerimento = M.sopra + 2;
  if (i !== null && posti > 0) {
    const altezzaRiquadro = altezzaSuggerimento(righe.length);
    const etichettaX: [number, number] = postiASinistra
      ? [M.sinistra + 4, M.sinistra + 4 + larghezzaTestoPosti]
      : [larghezza - M.destra - 4 - larghezzaTestoPosti, larghezza - M.destra - 4];
    const riquadroX: [number, number] = xs[i] < larghezza / 2
      ? [xs[i] + 12, xs[i] + 12 + LARGHEZZA_SUGGERIMENTO]
      : [xs[i] - 12 - LARGHEZZA_SUGGERIMENTO, xs[i] - 12];
    if (siIncrociano(riquadroX, etichettaX) && siIncrociano([sopraSuggerimento, sopraSuggerimento + altezzaRiquadro], [yPosti - 20, yPosti - 2])) {
      sopraSuggerimento = Math.max(M.sopra + 2, base - altezzaRiquadro - 4);
    }
  }

  return (
    <div className="stat-grafico" ref={ref}>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={descrizione} {...cursore.props}>
        <AsseY valori={scala.valori} y={y} sinistra={M.sinistra} destra={larghezza - M.destra} />
        {posti > 0 && (
          <g>
            <line x1={M.sinistra} x2={larghezza - M.destra} y1={yPosti} y2={yPosti} stroke="var(--amber)" strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
            <text
              x={postiASinistra ? M.sinistra + 4 : larghezza - M.destra - 4} y={yPosti - 6}
              textAnchor={postiASinistra ? 'start' : 'end'} fontSize={TESTO_PX} fill="var(--mist)"
            >
              {testoPosti}
            </text>
          </g>
        )}
        {xOggi !== null && (
          <g>
            <line x1={xOggi} x2={xOggi} y1={M.sopra} y2={base} stroke="var(--mist)" strokeWidth={1} strokeDasharray="4 3" />
            <text x={xSicura(xOggi, 'oggi', larghezza)} y={M.sopra - 8} textAnchor="middle" fontSize={TESTO_PX} fill="var(--mist)">oggi</text>
          </g>
        )}
        {conSimili && <path d={percorsoLinea(xs, media, y)} fill="none" stroke={GRIGIO_CONFRONTO} strokeWidth={2} strokeDasharray="5 4" />}
        <path d={percorsoLinea(xs, serie, y)} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {i !== null && <line x1={xs[i]} x2={xs[i]} y1={M.sopra} y2={base} stroke="var(--mist)" strokeOpacity={0.5} strokeWidth={1} />}
        {i !== null && media[i] != null && <Punto x={xs[i]} y={y(media[i] ?? 0)} colore={GRIGIO_CONFRONTO} />}
        {puntoEvento !== null && <Punto x={xs[puntoEvento]} y={y(serie[puntoEvento] ?? 0)} colore="var(--blue)" />}
        {taccheX.map((g) => (
          <text key={g} x={xSicura(xDi(g), etichettaGiorni(g), larghezza)} y={altezza - 8} textAnchor="middle" fontSize={TESTO_PX} fill="var(--mist)">
            {etichettaGiorni(g)}
          </text>
        ))}
      </svg>
      {i !== null && <Suggerimento x={xs[i]} sopra={sopraSuggerimento} larghezza={larghezza} titolo={titoloSuggerimento} righe={righe} />}
      <Annuncio testo={i === null ? '' : testoSuggerimento(titoloSuggerimento, righe)} />
      <Legenda voci={[
        { chiave: <ChiaveLinea stile="pieno" />, nome: 'Questo evento' },
        ...(conSimili ? [{ chiave: <ChiaveLinea stile="tratteggio" />, nome: 'Media eventi simili' }] : []),
        ...(posti > 0 ? [{ chiave: <ChiaveLinea stile="puntini" />, nome: 'Posti sui bus' }] : []),
      ]} />
    </div>
  );
}

// ---------------------------------------------------------------- Colonne

export interface DatoColonna {
  etichetta: string;
  valore: number;
  /** Testo sopra la colonna (senza asse); di norma il valore. */
  testo?: string;
  /** Riga in più nel riquadro che compare passando sopra (con l'asse). */
  dettaglio?: string;
}

function spezzaEtichetta(testo: string, spazio: number): string[] {
  if (larghezzaTesto(testo) <= spazio || !testo.includes(' ')) return [testo];
  const meta = testo.length / 2;
  let migliore = -1;
  for (let k = 0; k < testo.length; k++) {
    if (testo[k] === ' ' && (migliore < 0 || Math.abs(k - meta) < Math.abs(migliore - meta))) migliore = k;
  }
  return [testo.slice(0, migliore), testo.slice(migliore + 1)];
}

export function Colonne({ dati, ariaLabel, conAsse = false, nomeValore = '', testoVuoto = 'Nessun dato nel periodo.', altezza = 190 }: {
  dati: DatoColonna[];
  ariaLabel: string;
  /** true: asse con tacche e valori nel riquadro (tante colonne); false: valore sopra ogni colonna. */
  conAsse?: boolean;
  nomeValore?: string;
  testoVuoto?: string;
  altezza?: number;
}) {
  const { ref, larghezza } = useLarghezza();
  const n = dati.length;
  const massimo = Math.max(0, ...dati.map((d) => d.valore));
  const scala = conAsse ? scalaRotonda(massimo, 3) : { cima: massimo > 0 ? massimo : 1, valori: [] as number[] };
  const sinistra = conAsse ? margineSinistro(scala.valori) : 4;
  const spazioColonna = (larghezza - sinistra - 4) / Math.max(1, n);
  const righeEtichette = dati.map((d) => (conAsse ? [d.etichetta] : spezzaEtichetta(d.etichetta, spazioColonna - 6)));
  const dueRighe = righeEtichette.some((r) => r.length > 1);
  const M = { sopra: conAsse ? 12 : 20, destra: 4, sotto: dueRighe ? 40 : 26, sinistra };
  const areaL = Math.max(20, larghezza - M.sinistra - M.destra);
  const base = altezza - M.sotto;
  const areaA = base - M.sopra;
  const slot = areaL / Math.max(1, n);
  const larghezzaBarra = Math.max(2, Math.min(24, slot * 0.6));
  const xs = dati.map((_, k) => M.sinistra + slot * k + slot / 2);
  const y = (v: number) => base - (Math.max(0, v) / scala.cima) * areaA;
  const cima = (v: number) => (v > 0 ? Math.min(y(v), base - 1) : base);
  const cursore = useCursore(conAsse ? xs : [], larghezza);
  const i = cursore.indice;

  if (n === 0 || massimo <= 0) {
    return <div className="stat-grafico" ref={ref}><p className="stat-vuoto">{testoVuoto}</p></div>;
  }

  const larghezzaEt = Math.max(24, ...dati.map((d) => larghezzaTesto(d.etichetta)));
  const ogni = conAsse ? Math.ceil(n / Math.max(1, Math.min(8, Math.floor(areaL / (larghezzaEt + 12))))) : 1;
  const righe: RigaSuggerimento[] = i === null ? [] : [
    { valore: formattaNumero(dati[i].valore), nome: nomeValore },
    ...(dati[i].dettaglio ? [{ valore: dati[i].dettaglio ?? '' }] : []),
  ];

  return (
    <div className="stat-grafico" ref={ref}>
      <svg viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={ariaLabel} {...cursore.props}>
        {i !== null && <rect x={M.sinistra + slot * i} y={M.sopra} width={slot} height={areaA} fill="var(--dusk-2)" />}
        {conAsse
          ? <AsseY valori={scala.valori} y={y} sinistra={M.sinistra} destra={larghezza - M.destra} />
          : <line x1={M.sinistra} x2={larghezza - M.destra} y1={base + 0.5} y2={base + 0.5} stroke="var(--line)" strokeWidth={1} />}
        {dati.map((d, k) => (
          <path key={k} d={pathColonna(xs[k] - larghezzaBarra / 2, cima(d.valore), larghezzaBarra, base)} fill="var(--blue)" />
        ))}
        {!conAsse && dati.map((d, k) => {
          const testo = d.testo ?? formattaNumero(d.valore);
          return (
            <text key={k} x={xSicura(xs[k], testo, larghezza)} y={cima(d.valore) - 6} textAnchor="middle" fontSize={TESTO_PX} fontWeight={600} fill="var(--paper)">
              {testo}
            </text>
          );
        })}
        {dati.map((_, k) => (k % ogni !== 0 ? null : (
          <text key={k} y={base + 16} textAnchor="middle" fontSize={TESTO_PX} fill="var(--mist)">
            {righeEtichette[k].map((riga, j) => (
              <tspan key={j} x={xSicura(xs[k], riga, larghezza)} dy={j === 0 ? 0 : 13}>{riga}</tspan>
            ))}
          </text>
        )))}
      </svg>
      {i !== null && <Suggerimento x={xs[i]} sopra={M.sopra + 2} larghezza={larghezza} titolo={dati[i].etichetta} righe={righe} />}
      {conAsse && <Annuncio testo={i === null ? '' : testoSuggerimento(dati[i].etichetta, righe)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Barre orizzontali

export interface RigaBarra { chiave: string; etichetta: string; valore: number; testo: string }

/** Etichetta | barra | valore e quota, dalla riga più alta. */
export function BarreOrizzontali({ righe, ariaLabel, totale, testoVuoto = 'Nessun dato nel periodo.' }: {
  righe: RigaBarra[];
  ariaLabel: string;
  /** Base della quota %; di norma la somma delle righe. */
  totale?: number;
  testoVuoto?: string;
}) {
  const ordinate = [...righe].sort((a, b) => b.valore - a.valore);
  const massimo = Math.max(0, ...ordinate.map((r) => r.valore));
  const somma = totale ?? ordinate.reduce((s, r) => s + Math.max(0, r.valore), 0);
  if (ordinate.length === 0 || massimo <= 0) return <p className="stat-vuoto">{testoVuoto}</p>;
  return (
    <ul className="stat-barre" aria-label={ariaLabel}>
      {ordinate.map((r) => (
        <li key={r.chiave} className="stat-barra-riga">
          <span className="stat-barra-etichetta" title={r.etichetta}>{r.etichetta}</span>
          <span className="stat-barra-area" aria-hidden="true">
            {r.valore > 0 && <span className="stat-barra-pieno" style={{ width: `max(2px, ${((r.valore / massimo) * 100).toFixed(2)}%)` }} />}
          </span>
          <span className="stat-barra-valore">
            {r.testo}
            {somma > 0 && <small>{formattaPercentuale((Math.max(0, r.valore) / somma) * 100)}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Barretta dentro una cella di tabella, con il numero accanto. */
export function MiniBarra({ valore, massimo, testo }: { valore: number; massimo: number; testo: string }) {
  const quota = massimo > 0 ? Math.min(100, (Math.max(0, valore) / massimo) * 100) : 0;
  return (
    <span className="stat-mini">
      <span className="stat-mini-traccia" aria-hidden="true">
        {quota > 0 && <span style={{ width: `max(2px, ${quota.toFixed(2)}%)` }} />}
      </span>
      {testo}
    </span>
  );
}

// ---------------------------------------------------------------- Piccoli grafici

/** Andamento in miniatura (senza assi), per le righe delle tabelle. */
export function Minigrafico({ valori, ariaLabel, larghezza = 96, altezza = 28 }: {
  valori: number[];
  ariaLabel: string;
  larghezza?: number;
  altezza?: number;
}) {
  const n = valori.length;
  if (n === 0) return <span className="stat-spento">—</span>;
  const massimo = Math.max(0, ...valori);
  const margine = 4;
  const x = (i: number) => (n === 1 ? larghezza / 2 : margine + (i / (n - 1)) * (larghezza - margine * 2));
  const y = (v: number) => (massimo > 0 ? altezza - margine - (v / massimo) * (altezza - margine * 2) : altezza - margine);
  const punti = valori.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="stat-minigrafico" width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={ariaLabel}>
      <line x1={margine} x2={larghezza - margine} y1={altezza - margine + 0.5} y2={altezza - margine + 0.5} stroke="var(--line)" strokeWidth={1} />
      {n > 1 && <polyline points={punti} fill="none" stroke="var(--blue)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(n - 1)} cy={y(valori[n - 1])} r={2.5} fill="var(--blue)" />
    </svg>
  );
}

/** Barra con un segno: grigio per il valore del confronto, ambra per il pareggio. */
export function BarraProiettile({ valore, massimo = 100, confronto = null, segno = 'confronto', ariaLabel }: {
  valore: number;
  massimo?: number;
  confronto?: number | null;
  segno?: 'confronto' | 'pareggio';
  ariaLabel: string;
}) {
  const scala = Math.max(massimo, valore, confronto ?? 0, 1);
  const quota = (v: number) => Math.min(100, Math.max(0, (v / scala) * 100));
  return (
    <div className="stat-proiettile" role="img" aria-label={ariaLabel}>
      <span className="stat-proiettile-pieno" style={{ width: `${quota(valore).toFixed(2)}%` }} />
      {confronto !== null && (
        <span className={`stat-proiettile-segno${segno === 'pareggio' ? ' pareggio' : ''}`} style={{ left: `${quota(confronto).toFixed(2)}%` }} />
      )}
    </div>
  );
}

/** Oltre questo numero di posti una linea si disegna come barra, non come quadratini. */
export const POSTI_MASSIMI_GRIGLIA = 100;

/** Un quadratino per posto (25 per riga): blu i venduti (più chiari per una
 *  linea da confermare), bordo ambra sul posto del pareggio. Oltre 100 posti
 *  una barra, perché i quadratini diventerebbero troppo piccoli. */
export function GrigliaPosti({ posti, venduti, pareggio, daConfermare }: {
  posti: number;
  venduti: number;
  pareggio: number | null;
  daConfermare: boolean;
}) {
  if (posti <= 0) return null;
  const descrizione = `${pluraleNumero(venduti, 'passeggero', 'passeggeri')} su ${pluraleNumero(posti, 'posto', 'posti')}`
    + `${pareggio !== null ? `, pareggio a ${formattaNumero(pareggio)}` : ''}`;
  if (posti > POSTI_MASSIMI_GRIGLIA) {
    return <BarraProiettile valore={venduti} massimo={posti} confronto={pareggio} segno="pareggio" ariaLabel={descrizione} />;
  }
  const colonne = 25;
  const lato = 10;
  const spazio = 3;
  const bordo = 2;
  const righe = Math.ceil(posti / colonne);
  const larghezza = colonne * (lato + spazio) - spazio + bordo * 2;
  const altezza = righe * (lato + spazio) - spazio + bordo * 2;
  return (
    <svg className="stat-posti" viewBox={`0 0 ${larghezza} ${altezza}`} role="img" aria-label={descrizione}>
      {Array.from({ length: posti }, (_, k) => {
        const venduto = k < venduti;
        const soglia = pareggio !== null && k === pareggio - 1;
        return (
          <rect
            key={k}
            x={bordo + (k % colonne) * (lato + spazio)}
            y={bordo + Math.floor(k / colonne) * (lato + spazio)}
            width={lato} height={lato} rx={2}
            fill={venduto ? 'var(--blue)' : 'var(--line)'}
            fillOpacity={venduto && daConfermare ? 0.4 : 1}
            stroke={soglia ? 'var(--amber)' : 'none'}
            strokeWidth={soglia ? 2 : 0}
          />
        );
      })}
    </svg>
  );
}

/** Una barra divisa in parti (es. pagamento completo / acconto), con legenda. */
export function BarraDivisa({ parti, titolo, formatta = formattaNumero }: {
  parti: { etichetta: string; valore: number }[];
  titolo: string;
  formatta?: (n: number) => string;
}) {
  const totale = parti.reduce((s, p) => s + Math.max(0, p.valore), 0);
  if (totale <= 0) return <p className="stat-vuoto">Nessun dato nel periodo.</p>;
  const quota = (v: number) => formattaPercentuale((Math.max(0, v) / totale) * 100);
  const colore = (k: number) => COLORI_DIVISA[k % COLORI_DIVISA.length];
  const descrizione = `${titolo}: ${parti.map((p) => `${p.etichetta} ${formatta(p.valore)} (${quota(p.valore)})`).join(', ')}`;
  return (
    <div>
      <div className="stat-divisa" role="img" aria-label={descrizione}>
        {parti.map((p, k) => (p.valore > 0
          ? <span key={p.etichetta} style={{ flex: `${p.valore} 1 0%`, background: colore(k) }} />
          : null))}
      </div>
      <div className="stat-legenda">
        {parti.map((p, k) => (
          <span key={p.etichetta} className="stat-legenda-voce">
            <span className="stat-quadratino" style={{ background: colore(k) }} />
            {p.etichetta} <b>{formatta(p.valore)}</b> · {quota(p.valore)}
          </span>
        ))}
      </div>
    </div>
  );
}
