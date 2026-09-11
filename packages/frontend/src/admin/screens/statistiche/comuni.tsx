import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FiltroPeriodo, TipoFonte, Valore } from '../../../api/statistiche';
import { formattaEuro } from '../../../shared/formato';
import { motivoErrore } from '../../shared/errori';
import type { InfoPeriodo } from './periodo';

/** Pezzi condivisi dalle schede delle Statistiche: numeri, caricamento dei
 *  dati, card KPI, schede, stati di errore. */

export interface PropsScheda {
  filtro: FiltroPeriodo;
  /** Periodo effettivo da mostrare accanto ai filtri (null mentre i dati arrivano). */
  onPeriodo: (info: InfoPeriodo) => void;
}

export function chiaveFiltro(filtro: FiltroPeriodo): string {
  return `${filtro.dal}|${filtro.al}|${filtro.confronto}`;
}

// ---------------------------------------------------------------- Numeri

const interi = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const unDecimale = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** Numero intero scritto come nel resto delle Statistiche. */
export function formattaNumero(n: number): string {
  return interi.format(Number.isFinite(n) ? n : 0);
}

/** "52%"; sotto il 10 con un decimale ("4,5%"). */
export function formattaPercentuale(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${(Math.abs(n) < 10 ? unDecimale : interi).format(n)}%`;
}

/** La regola di plurale() di formato.ts, con il numero scritto da formattaNumero. */
export function pluraleNumero(n: number, singolare: string, formaPlurale: string): string {
  return `${formattaNumero(n)} ${n === 1 ? singolare : formaPlurale}`;
}

/** Totali senza centesimi ("52.300 €"); i prezzi unitari usano formattaEuro. */
export function formattaEuroIntero(n: number): string {
  return formattaEuro(n, { senzaDecimali: true });
}

export const ETICHETTA_FONTE: Record<TipoFonte, string> = {
  promoter: 'Promoter',
  white_label: 'White Label',
  campagna: 'Campagna',
  utm_non_registrata: 'UTM non registrati',
  sito: 'Sito',
};

// ---------------------------------------------------------------- Dati

export interface StatoDati<T> {
  dati: T | null;
  errore: { motivo: unknown } | null;
  caricando: boolean;
  riprova: () => void;
}

/** Carica i dati a ogni cambio di `chiave`. Le risposte arrivate tardi (filtro
 *  cambiato nel frattempo) si scartano; durante un nuovo caricamento restano
 *  i dati di prima, attenuati. */
export function useDati<T>(carica: () => Promise<T>, chiave: string): StatoDati<T> {
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<{ motivo: unknown } | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [tentativo, setTentativo] = useState(0);
  const ultimaRichiesta = useRef(0);

  useEffect(() => {
    const numero = ++ultimaRichiesta.current;
    setCaricando(true);
    setErrore(null);
    carica().then(
      (risposta) => {
        if (numero !== ultimaRichiesta.current) return;
        setDati(risposta);
        setCaricando(false);
      },
      (motivo: unknown) => {
        if (numero !== ultimaRichiesta.current) return;
        setDati(null);
        setErrore({ motivo });
        setCaricando(false);
      },
    );
    // `carica` è una funzione nuova a ogni render: contano la chiave e "Riprova".
  }, [chiave, tentativo]); // eslint-disable-line react-hooks/exhaustive-deps

  return { dati, errore, caricando, riprova: () => setTentativo((t) => t + 1) };
}

/** Comunica al guscio cosa scrivere accanto ai filtri. */
export function useSegnalaPeriodo(info: InfoPeriodo, onPeriodo: (info: InfoPeriodo) => void) {
  useEffect(() => {
    onPeriodo(info);
  }, [info, onPeriodo]);
}

// ---------------------------------------------------------------- Stati

export function ErroreStatistiche({ motivo, onRiprova, dentroScheda = false }: {
  motivo: unknown;
  onRiprova: () => void;
  dentroScheda?: boolean;
}) {
  return (
    <div className={dentroScheda ? 'stat-errore' : 'section-card stat-errore'} role="alert">
      <p>Caricamento non riuscito: {motivoErrore(motivo)}</p>
      <button type="button" className="btn btn-ghost btn-piccolo" onClick={onRiprova}>Riprova</button>
    </div>
  );
}

/** "Carico…", l'errore con "Riprova", oppure il contenuto (attenuato se sta ricaricando). */
export function Caricamento<T>({ stato, children }: { stato: StatoDati<T>; children: (dati: T) => ReactNode }) {
  if (stato.errore) return <ErroreStatistiche motivo={stato.errore.motivo} onRiprova={stato.riprova} />;
  if (stato.dati === null) return <p className="testo-intro">Carico…</p>;
  return (
    <div className={stato.caricando ? 'stat-aggiorno' : undefined} aria-busy={stato.caricando}>
      {children(stato.dati)}
    </div>
  );
}

interface PropsProtezione { chiave: string; children: ReactNode }
interface StatoProtezione { errore: boolean; chiave: string; tentativo: number }

/** Se una risposta non ha la forma attesa, un messaggio al posto della scheda
 *  invece di una pagina bianca in tutto il gestionale. "Riprova" rimonta la
 *  scheda da capo (nuova chiave), quindi ricarica i dati. */
export class ProtezioneErrori extends Component<PropsProtezione, StatoProtezione> {
  state: StatoProtezione = { errore: false, chiave: this.props.chiave, tentativo: 0 };

  static getDerivedStateFromError(): Partial<StatoProtezione> {
    return { errore: true };
  }

  static getDerivedStateFromProps(props: PropsProtezione, stato: StatoProtezione): Partial<StatoProtezione> | null {
    return props.chiave === stato.chiave ? null : { errore: false, chiave: props.chiave };
  }

  riprova = () => {
    this.setState((stato) => ({ errore: false, tentativo: stato.tentativo + 1 }));
  };

  render() {
    if (!this.state.errore) return <Fragment key={this.state.tentativo}>{this.props.children}</Fragment>;
    return (
      <div className="section-card stat-errore" role="alert">
        <p>Caricamento non riuscito: i dati ricevuti non si possono mostrare.</p>
        <button type="button" className="btn btn-ghost btn-piccolo" onClick={this.riprova}>Riprova</button>
      </div>
    );
  }
}

// ---------------------------------------------------------------- Card

export function Scheda({ titolo, conteggio, azione, classe, children }: {
  titolo: string;
  conteggio?: number;
  azione?: ReactNode;
  classe?: string;
  children: ReactNode;
}) {
  return (
    <section className={`section-card stat-scheda${classe ? ` ${classe}` : ''}`}>
      <div className="stat-scheda-testa">
        <h3>
          {titolo}
          {conteggio !== undefined && <span className="stat-conteggio">{formattaNumero(conteggio)}</span>}
        </h3>
        {azione}
      </div>
      {children}
    </section>
  );
}

export function BottoneCsv({ onScarica, disabilitato = false }: { onScarica: () => void; disabilitato?: boolean }) {
  return (
    <button type="button" className="btn btn-ghost btn-piccolo" onClick={onScarica} disabled={disabilitato}>
      Esporta CSV
    </button>
  );
}

export function Vuoto({ children }: { children: ReactNode }) {
  return <p className="stat-vuoto">{children}</p>;
}

export function GrigliaKpi({ children }: { children: ReactNode }) {
  return <div className="dash-grid stat-kpi-griglia">{children}</div>;
}

export function Kpi({ etichetta, valore, tono, children }: {
  etichetta: string;
  valore: ReactNode;
  tono?: 'negativo' | 'spento';
  children?: ReactNode;
}) {
  return (
    <div className="dash-card stat-kpi">
      <div className={`num${tono ? ` stat-num-${tono}` : ''}`}>{valore}</div>
      <div className="lbl">{etichetta}</div>
      {children}
    </div>
  );
}

export function KpiExtra({ children }: { children: ReactNode }) {
  return <p className="stat-kpi-extra">{children}</p>;
}

/** "+18% rispetto a 1.088": verde se sale, rosso se scende. `neutra` per i
 *  costi, che crescono anche solo perché ci sono più eventi. */
export function Variazione({ valore, formatta, neutra = false }: {
  valore: Valore;
  formatta: (n: number) => string;
  neutra?: boolean;
}) {
  const { attuale, precedente } = valore;
  if (precedente === null) return null;
  if (precedente === 0) return <div className="stat-variazione">prima: {formatta(0)}</div>;
  const delta = ((attuale - precedente) / Math.abs(precedente)) * 100;
  const testo = formattaPercentuale(Math.abs(delta));
  const pari = testo === '0%';
  const segno = pari ? '' : delta > 0 ? '+' : '−';
  const tono = neutra || pari ? '' : delta > 0 ? ' stat-su' : ' stat-giu';
  return <div className={`stat-variazione${tono}`}>{segno}{testo} rispetto a {formatta(precedente)}</div>;
}

/** Per le percentuali (riempimento): la differenza in punti. */
export function VariazionePunti({ attuale, precedente }: { attuale: number; precedente: number }) {
  const differenza = Math.round((attuale - precedente) * 10) / 10;
  if (differenza === 0) return <div className="stat-variazione">come prima ({formattaPercentuale(precedente)})</div>;
  const assoluta = Math.abs(differenza);
  return (
    <div className={`stat-variazione ${differenza > 0 ? 'stat-su' : 'stat-giu'}`}>
      {differenza > 0 ? '+' : '−'}{unDecimale.format(assoluta)} {assoluta === 1 ? 'punto' : 'punti'} rispetto a {formattaPercentuale(precedente)}
    </div>
  );
}

export function NotaCostiMancanti({ eventi }: { eventi: number }) {
  if (eventi <= 0) return null;
  return (
    <p className="stat-nota">
      <span className="stat-nota-segno" aria-hidden="true">⚠</span>{' '}
      {pluraleNumero(eventi, 'evento', 'eventi')} con costi dei bus incompleti (un bus senza costo o un tragitto con
      passeggeri senza bus): il margine vero è più basso.
    </p>
  );
}
