import type { BusSimulato, EventoSimulato, LineaSimulata, RegolaCompensoEvento, TragittoSimulato } from '../../../api/statistiche';

/** I conti di Statistiche › Bus in più e del riquadro della pagina Linee,
 *  senza React: si provano in contiBusInPiu.test.ts.
 *
 *  Il server manda, per ogni tragitto, chi parte su ogni bus e quanto porta
 *  in ogni combinazione di interruttori; qui si sceglie quella accesa e si
 *  aggiungono i costi dei bus che partono. Decisioni del proprietario
 *  (settembre 2026): incassato = quanto è stato pagato davvero (di un acconto
 *  solo l'acconto) e previsto = incassato + saldi che mancano, voci separate;
 *  il risultato previsto (previsto − spesa) è quello in evidenza, quello a
 *  oggi (incassato − spesa) in piccolo; spesa = costo dei bus + commissioni
 *  dei promoter + quote White Label (+ il compenso del responsabile, solo
 *  sull'evento intero: `contiEvento`). Le scelte (parte / non parte, costo
 *  scritto a mano) sono solo una simulazione: non confermano niente e restano
 *  in questo browser. */

export interface SceltaBus {
  parte?: boolean;
  /** Costo scritto a mano al posto di preventivo o quotazione. */
  costo?: number;
}
export type Scelte = Record<string, SceltaBus>;

const CHIAVE_SCELTE = 'inbus.gestionale.busInPiu';

export interface Voce {
  passeggeri: number;
  posti: number;
  /** Incassato: pagato davvero, di un acconto non saldato solo l'acconto. */
  incasso: number;
  /** Saldi ancora da pagare: con l'incassato fanno il previsto. */
  daIncassare: number;
  promoter: number;
  whiteLabel: number;
  costoBus: number;
  bus: number;
  /** Bus che partono senza nessun costo: contano 0. */
  busSenzaCosto: number;
  /** Compenso del responsabile dell'evento, previsto e a oggi: 0 sotto l'evento
   *  (tragitti, linee e bus), perché è dell'evento intero. */
  compenso: number;
  compensoAOggi: number;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
export const voceVuota = (): Voce => ({
  passeggeri: 0, posti: 0, incasso: 0, daIncassare: 0, promoter: 0, whiteLabel: 0, costoBus: 0, bus: 0, busSenzaCosto: 0, compenso: 0, compensoAOggi: 0,
});
export const spesa = (v: Voce) => arrotonda(v.costoBus + v.promoter + v.whiteLabel + v.compenso);
/** Incassato + saldi che mancano. */
export const previsto = (v: Voce) => arrotonda(v.incasso + v.daIncassare);
/** Risultato previsto: quello in evidenza. */
export const risultato = (v: Voce) => arrotonda(previsto(v) - spesa(v));
/** Risultato con i soldi già entrati (e il compenso maturato su quelli). */
export const risultatoAOggi = (v: Voce) => arrotonda(v.incasso - (v.costoBus + v.promoter + v.whiteLabel + v.compensoAOggi));

/** Il compenso del responsabile: la stessa regola del server
 *  (packages/backend/src/modules/collaboratori/compenso.ts). Sulla percentuale
 *  del margine niente compenso se l'evento è in perdita. */
export function compensoResponsabile(regola: RegolaCompensoEvento, base: { incasso: number; incassato: number; margine: number; margineAOggi: number }) {
  const quota = regola.valore / 100;
  switch (regola.tipo) {
    case 'FISSO': return { previsto: arrotonda(regola.valore), aOggi: arrotonda(regola.valore) };
    case 'PERCENTUALE_INCASSO': return { previsto: arrotonda(base.incasso * quota), aOggi: arrotonda(base.incassato * quota) };
    case 'PERCENTUALE_MARGINE': return { previsto: arrotonda(Math.max(0, base.margine) * quota), aOggi: arrotonda(Math.max(0, base.margineAOggi) * quota) };
  }
}

export function somma(voci: Voce[]): Voce {
  const s = voceVuota();
  for (const v of voci) {
    s.passeggeri += v.passeggeri;
    s.posti += v.posti;
    s.incasso += v.incasso;
    s.daIncassare += v.daIncassare;
    s.promoter += v.promoter;
    s.whiteLabel += v.whiteLabel;
    s.costoBus += v.costoBus;
    s.bus += v.bus;
    s.busSenzaCosto += v.busSenzaCosto;
    s.compenso += v.compenso;
    s.compensoAOggi += v.compensoAOggi;
  }
  return {
    ...s,
    incasso: arrotonda(s.incasso), daIncassare: arrotonda(s.daIncassare), promoter: arrotonda(s.promoter), whiteLabel: arrotonda(s.whiteLabel),
    costoBus: arrotonda(s.costoBus), compenso: arrotonda(s.compenso), compensoAOggi: arrotonda(s.compensoAOggi),
  };
}

/** Guadagno, pareggio (sotto l'euro di differenza) o perdita. */
export type Giudizio = 'guadagno' | 'pareggio' | 'perdita';
export function giudizio(n: number): Giudizio {
  if (Math.abs(n) < 1) return 'pareggio';
  return n > 0 ? 'guadagno' : 'perdita';
}

/** Un bus con l'interruttore: i bus confermati (e i viaggi passati) partono sempre. */
export const conInterruttore = (b: BusSimulato) => b.interruttore !== null;
/** Di serie partono i bus che raggiungono il pareggio (linee senza bus e proposte); quelli sotto no. */
export const parteDiSerie = (b: BusSimulato) => b.tipo !== 'sotto-pareggio';
export const parte = (b: BusSimulato, scelte: Scelte) => !conInterruttore(b) || (scelte[b.chiave]?.parte ?? parteDiSerie(b));
export const costoDi = (b: BusSimulato, scelte: Scelte): number | null => (conInterruttore(b) ? scelte[b.chiave]?.costo ?? b.costo : b.costo);

/** Il numero della combinazione accesa: il bit i per il bus in più i che parte. */
export function combinazione(t: TragittoSimulato, scelte: Scelte): number {
  return t.bus.reduce((c, b) => (b.interruttore !== null && parte(b, scelte) ? c | (1 << b.interruttore) : c), 0);
}

/** I numeri di un bus in una combinazione in cui parte. */
function voceBus(t: TragittoSimulato, i: number, numero: number, scelte: Scelte): Voce {
  const b = t.bus[i];
  const [passeggeri, incasso, promoter, whiteLabel, daIncassare] = t.esiti[numero]?.[i] ?? [0, 0, 0, 0, 0];
  const costo = costoDi(b, scelte);
  const veroBus = b.tipo !== 'senza-bus';
  return {
    passeggeri, posti: b.posti, incasso, daIncassare, promoter, whiteLabel,
    costoBus: costo ?? 0, bus: veroBus ? 1 : 0, busSenzaCosto: veroBus && costo === null ? 1 : 0, compenso: 0, compensoAOggi: 0,
  };
}

export interface RigaBus {
  bus: BusSimulato;
  parte: boolean;
  /** Se parte, i suoi numeri; se non parte, quelli che avrebbe partendo (con gli altri bus come sono scelti). */
  voce: Voce;
}
export interface RigaLinea { linea: LineaSimulata; voce: Voce; bus: RigaBus[] }
/** A terra: chi non trova posto sui bus che partono (sarebbe rimborsato) e
 *  quanto valgono le sue prenotazioni (previsto). Chi ha già chiesto il rimborso non c'è. */
export interface ATerra { passeggeri: number; valore: number }
export interface ContiTragitto { tragitto: TragittoSimulato; voce: Voce; aTerra: ATerra; linee: RigaLinea[] }
export interface ContiEvento { evento: EventoSimulato; voce: Voce; aTerra: ATerra; tragitti: ContiTragitto[] }

const sommaATerra = (tutti: ATerra[]): ATerra => ({
  passeggeri: tutti.reduce((s, a) => s + a.passeggeri, 0),
  valore: arrotonda(tutti.reduce((s, a) => s + a.valore, 0)),
});

export function contiTragitto(t: TragittoSimulato, scelte: Scelte): ContiTragitto {
  const accesa = combinazione(t, scelte);
  const righe = t.bus.map((b, i): RigaBus => {
    const parteOra = parte(b, scelte);
    const numero = parteOra || b.interruttore === null ? accesa : accesa | (1 << b.interruttore);
    return { bus: b, parte: parteOra, voce: voceBus(t, i, numero, scelte) };
  });
  const linee = t.linee.map((linea, indice): RigaLinea => {
    const bus = righe.filter((r) => r.bus.linea === indice);
    return { linea, bus, voce: somma(bus.filter((r) => r.parte).map((r) => r.voce)) };
  });
  const voce = somma(linee.map((l) => l.voce));
  const aTerra = {
    passeggeri: Math.max(0, t.passeggeri - t.inAttesaDiRimborso - voce.passeggeri),
    valore: Math.max(0, arrotonda(t.incasso + t.daIncassare - previsto(voce))),
  };
  return { tragitto: t, voce, aTerra, linee };
}

/** L'evento intero: i suoi tragitti più il compenso del responsabile,
 *  calcolato su chi parte con i bus scelti (chi resta a terra è rimborsato). */
export function contiEvento(e: EventoSimulato, scelte: Scelte): ContiEvento {
  const tragitti = e.tragitti.map((t) => contiTragitto(t, scelte));
  const base = somma(tragitti.map((t) => t.voce));
  const compenso = e.compenso
    ? compensoResponsabile(e.compenso, { incasso: previsto(base), incassato: base.incasso, margine: risultato(base), margineAOggi: risultatoAOggi(base) })
    : null;
  const voce = compenso ? { ...base, compenso: compenso.previsto, compensoAOggi: compenso.aOggi } : base;
  return { evento: e, voce, aTerra: sommaATerra(tragitti.map((t) => t.aTerra)), tragitti };
}

export function contiEventi(eventi: EventoSimulato[], scelte: Scelte): { voce: Voce; aTerra: ATerra } {
  const tutti = eventi.map((e) => contiEvento(e, scelte));
  return { voce: somma(tutti.map((c) => c.voce)), aTerra: sommaATerra(tutti.map((c) => c.aTerra)) };
}

// ---------------------------------------------------------------- Scelte ricordate nel browser

export function leggiScelte(): Scelte {
  try {
    const letto: unknown = JSON.parse(window.localStorage.getItem(CHIAVE_SCELTE) ?? '{}');
    if (!letto || typeof letto !== 'object' || Array.isArray(letto)) return {};
    const scelte: Scelte = {};
    for (const [chiave, valore] of Object.entries(letto as Record<string, unknown>)) {
      if (!valore || typeof valore !== 'object') continue;
      const { parte: p, costo } = valore as Record<string, unknown>;
      scelte[chiave] = {
        ...(typeof p === 'boolean' ? { parte: p } : {}),
        ...(typeof costo === 'number' && Number.isFinite(costo) && costo >= 0 ? { costo } : {}),
      };
    }
    return scelte;
  } catch {
    return {};
  }
}

export function salvaScelte(scelte: Scelte) {
  try {
    window.localStorage.setItem(CHIAVE_SCELTE, JSON.stringify(scelte));
  } catch {
    // Senza memoria del browser le scelte valgono finché la pagina resta aperta.
  }
}

/** Cambia una scelta; tornata come di serie (e senza costo a mano) sparisce. */
export function conScelta(scelte: Scelte, b: BusSimulato, cambio: SceltaBus): Scelte {
  const nuova: SceltaBus = { ...scelte[b.chiave], ...cambio };
  if (nuova.parte === parteDiSerie(b)) delete nuova.parte;
  if (nuova.costo === undefined) delete nuova.costo;
  const altre = { ...scelte };
  delete altre[b.chiave];
  return Object.keys(nuova).length > 0 ? { ...altre, [b.chiave]: nuova } : altre;
}
