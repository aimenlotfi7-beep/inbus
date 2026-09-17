import type { BusInPiuSimulato, EventoConcluso, EventoSimulato, TragittoSimulato } from '../../../api/statistiche';

/** I conti della simulazione dei bus in più (Statistiche › Bus in più e
 *  pagina Linee), senza React: si provano in contiBusInPiu.test.ts.
 *
 *  Il server manda, per ogni tragitto, chi parte e quanto porta in ogni
 *  combinazione di interruttori; qui si sceglie quella accesa e si tolgono
 *  i costi dei bus che partono. Le scelte (parte / non parte, costo scritto a
 *  mano) sono solo una simulazione: non confermano niente e restano in
 *  questo browser. */

export interface SceltaBus {
  parte?: boolean;
  /** Costo scritto a mano al posto di preventivo o quotazione. */
  costo?: number;
}
export type Scelte = Record<string, SceltaBus>;

const CHIAVE_SCELTE = 'inbus.gestionale.busInPiu';

/** Di serie partono i bus che raggiungono il pareggio (linee senza bus e
 *  proposte); quelli sotto il pareggio no. */
export const parteDiSerie = (b: BusInPiuSimulato) => b.tipo !== 'sotto-pareggio';
export const parte = (b: BusInPiuSimulato, scelte: Scelte) => scelte[b.chiave]?.parte ?? parteDiSerie(b);
export const costoDi = (b: BusInPiuSimulato, scelte: Scelte): number | null => scelte[b.chiave]?.costo ?? b.costo;

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Guadagno, pareggio (sotto l'euro di differenza) o perdita. */
export type Giudizio = 'guadagno' | 'pareggio' | 'perdita';
export function giudizio(margine: number): Giudizio {
  if (Math.abs(margine) < 1) return 'pareggio';
  return margine > 0 ? 'guadagno' : 'perdita';
}

export interface Conti {
  /** Passeggeri che partono. */
  passeggeri: number;
  /** Senza posto sui bus che partono, o con un rimborso in attesa: rimborsati. */
  rimborsati: number;
  incasso: number;
  commissioni: number;
  bus: number;
  costoBus: number;
  /** Bus che partono senza nessun costo (né preventivo, né quotazione, né scritto a mano): contano 0. */
  busSenzaCosto: number;
  margine: number;
}

export const contiVuoti = (): Conti => ({ passeggeri: 0, rimborsati: 0, incasso: 0, commissioni: 0, bus: 0, costoBus: 0, busSenzaCosto: 0, margine: 0 });

export function sommaConti(tutti: Conti[]): Conti {
  const s = contiVuoti();
  for (const c of tutti) {
    s.passeggeri += c.passeggeri;
    s.rimborsati += c.rimborsati;
    s.incasso += c.incasso;
    s.commissioni += c.commissioni;
    s.bus += c.bus;
    s.costoBus += c.costoBus;
    s.busSenzaCosto += c.busSenzaCosto;
    s.margine += c.margine;
  }
  return { ...s, incasso: arrotonda(s.incasso), commissioni: arrotonda(s.commissioni), costoBus: arrotonda(s.costoBus), margine: arrotonda(s.margine) };
}

/** Il numero della combinazione accesa: il bit i per il bus in più i che parte. */
export function combinazione(t: TragittoSimulato, scelte: Scelte): number {
  return t.busInPiu.reduce((c, b, i) => (parte(b, scelte) ? c | (1 << i) : c), 0);
}

function contiCombinazione(t: TragittoSimulato, scelte: Scelte, numero: number): Conti {
  const [passeggeri, incasso, commissioni] = t.esiti[numero] ?? [0, 0, 0];
  let costoBus = t.costoBusConfermati;
  let bus = t.busConfermati;
  let busSenzaCosto = t.busSenzaCosto;
  t.busInPiu.forEach((b, i) => {
    if ((numero & (1 << i)) === 0) return;
    bus += 1;
    const costo = costoDi(b, scelte);
    if (costo === null) busSenzaCosto += 1;
    else costoBus += costo;
  });
  return {
    passeggeri,
    rimborsati: Math.max(0, t.passeggeri - passeggeri),
    incasso,
    commissioni,
    bus,
    costoBus: arrotonda(costoBus),
    busSenzaCosto,
    margine: arrotonda(incasso - costoBus - commissioni),
  };
}

export const contiTragitto = (t: TragittoSimulato, scelte: Scelte): Conti => contiCombinazione(t, scelte, combinazione(t, scelte));
export const contiEvento = (e: EventoSimulato, scelte: Scelte): Conti => sommaConti(e.tragitti.map((t) => contiTragitto(t, scelte)));
/** Solo i bus confermati: tutti i bus in più spenti. */
export const contiSoloConfermati = (e: EventoSimulato): Conti => sommaConti(e.tragitti.map((t) => contiCombinazione(t, {}, 0)));

/** Cosa cambia facendo partire il bus in più i, con gli altri come sono scelti. */
export function effettoBus(t: TragittoSimulato, i: number, scelte: Scelte) {
  const acceso = combinazione(t, scelte) | (1 << i);
  const spento = acceso & ~(1 << i);
  const [passeggeriCon, incassoCon, commissioniCon] = t.esiti[acceso] ?? [0, 0, 0];
  const [passeggeriSenza, incassoSenza, commissioniSenza] = t.esiti[spento] ?? [0, 0, 0];
  const incassoNetto = arrotonda(incassoCon - commissioniCon - (incassoSenza - commissioniSenza));
  const costo = costoDi(t.busInPiu[i], scelte);
  return {
    passeggeri: passeggeriCon - passeggeriSenza,
    incassoNetto,
    costo,
    risultato: costo === null ? null : arrotonda(incassoNetto - costo),
  };
}

export function contiConcluso(e: EventoConcluso): Conti {
  return {
    passeggeri: e.passeggeri, rimborsati: e.nonPartiti, incasso: e.incasso, commissioni: e.commissioni,
    bus: e.bus, costoBus: e.costoBus, busSenzaCosto: e.busSenzaCosto, margine: e.margine,
  };
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
export function conScelta(scelte: Scelte, b: BusInPiuSimulato, cambio: SceltaBus): Scelte {
  const nuova: SceltaBus = { ...scelte[b.chiave], ...cambio };
  if (nuova.parte === parteDiSerie(b)) delete nuova.parte;
  if (nuova.costo === undefined) delete nuova.costo;
  const altre = { ...scelte };
  delete altre[b.chiave];
  return Object.keys(nuova).length > 0 ? { ...altre, [b.chiave]: nuova } : altre;
}
