import { arrotondaEuro } from '../statistiche/calcoli.js';
import { riempiBus, type BusDaRiempire, type GruppoPasseggeri } from '../prenotazioni/riempimento-bus.js';
import { passiBusInPiu, PREFISSO_LINEA_SENZA_BUS, type StatoProposte } from './linee-da-confermare.service.js';

/** Simulazione economica dei bus in più di un tragitto (Statistiche › Bus in
 *  più e pagina Linee). Nessun database qui: si prova da sola in
 *  simulazione-bus.test.ts.
 *
 *  Regole decise dal proprietario (settembre 2026): serve a capire se
 *  conviene far partire un bus per chi resta fuori, anche sotto il pareggio
 *  (per immagine o altre esigenze).
 *  - i bus in più sono, in ordine: le linee confermate ancora senza bus, le
 *    proposte da confermare, poi altri bus con la stessa regola delle
 *    proposte finché resta qualcuno che un bus può portare;
 *  - ogni bus in più ha un interruttore «Parte / Non parte»: è solo una
 *    simulazione, non conferma niente;
 *  - chi non trova posto sui bus che partono viene rimborsato: il suo incasso
 *    e le sue commissioni non contano;
 *  - chi sale lo decide la regola dello smistamento (gruppi interi, solo sui
 *    bus che si fermano alla loro fermata): per questo ogni combinazione di
 *    interruttori si calcola qui, e la pagina sceglie quella accesa. */

/** Bus in più simulati al massimo per tragitto: le combinazioni sono 2^n. */
export const MAX_BUS_IN_PIU = 8;

export interface GruppoConIncasso extends GruppoPasseggeri {
  /** Valore della prenotazione (un acconto conta già intero). */
  incasso: number;
  commissioni: number;
  /** Con un rimborso in attesa tiene il suo posto ma non conta: né passeggeri né incasso. */
  rimborsoInAttesa: boolean;
}

/** Un bus nello smistamento simulato: `interruttore` è la sua posizione tra i
 *  bus in più, null per un bus confermato (parte sempre). */
export interface BusSimulato extends BusDaRiempire { interruttore: number | null }

export type TipoBusInPiu = 'linea-senza-bus' | 'proposta' | 'sotto-pareggio';

export interface BusInPiu {
  /** Stabile tra un caricamento e l'altro: la pagina ci ricorda l'interruttore. */
  chiave: string;
  nome: string;
  tipo: TipoBusInPiu;
  /** La riga di `linee` (linea senza bus o proposta salvata): i suoi preventivi. */
  lineaId: string | null;
  posti: number;
}

/** [passeggeri che partono, incasso, commissioni] per una combinazione. */
export type EsitoCombinazione = [number, number, number];

const stesseFermate = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** I bus del tragitto per la simulazione: i confermati, poi i bus in più
 *  (al massimo `massimo`). */
export function busDellaSimulazione(
  tragittoId: string,
  stato: Pick<StatoProposte, 'dati' | 'necessarie' | 'bozze' | 'tutte' | 'principale'>,
  massimo = MAX_BUS_IN_PIU,
): { bus: BusSimulato[]; inPiu: BusInPiu[] } {
  const { dati } = stato;
  const inPiu: BusInPiu[] = [];
  const nomeLinea = new Map(stato.tutte.map((l) => [l.id, l.nome]));
  const bus: BusSimulato[] = dati.bus.map((b) => {
    if (!b.busId.startsWith(PREFISSO_LINEA_SENZA_BUS) || inPiu.length >= massimo) return { ...b, interruttore: null };
    const lineaId = b.busId.slice(PREFISSO_LINEA_SENZA_BUS.length);
    inPiu.push({ chiave: `linea:${lineaId}`, nome: `Bus 1 · ${nomeLinea.get(lineaId) ?? 'linea senza bus'}`, tipo: 'linea-senza-bus', lineaId, posti: b.postiBus });
    return { ...b, interruttore: inPiu.length - 1 };
  });

  if (dati.fermateOrdinate.length === 0 || inPiu.length >= massimo) return { bus, inPiu };
  const cittaDi = new Map(dati.fermateOrdinate.map((f) => [f.id, f.citta]));
  const { passi } = passiBusInPiu(dati, 1, massimo - inPiu.length);
  let busSullaPrincipale = 0;
  passi.forEach((passo, i) => {
    const diBus = passo.proposta.tipo === 'bus';
    if (diBus) busSullaPrincipale += 1;
    const proposta = i < stato.necessarie.length;
    const bozza = proposta ? stato.bozze[i] : undefined;
    const salvata = bozza && stesseFermate(bozza.fermateIds, passo.proposta.fermateIds) ? bozza : undefined;
    const nomeCalcolato = !diBus
      ? `Linea nuova da ${cittaDi.get(passo.proposta.fermateIds[0]) ?? 'una fermata successiva'}`
      : stato.principale
        ? `Bus ${stato.principale.bus + busSullaPrincipale} · ${stato.principale.nome}`
        : busSullaPrincipale === 1 ? 'Primo bus' : `Bus ${busSullaPrincipale}`;
    inPiu.push({
      chiave: salvata ? `proposta:${salvata.id}` : `${tragittoId}:bus-in-piu:${i + 1}`,
      // Il nome che la proposta ha nella pagina Linee.
      nome: salvata ? (!stato.principale && i === 0 ? `Primo bus · ${salvata.nome}` : salvata.nome) : nomeCalcolato,
      tipo: proposta ? 'proposta' : 'sotto-pareggio',
      lineaId: salvata?.id ?? null,
      posti: passo.bus.postiBus,
    });
    bus.push({ ...passo.bus, busId: `bus-in-piu-${i + 1}`, interruttore: inPiu.length - 1 });
  });
  return { bus, inPiu };
}

/** Per ogni combinazione di interruttori (il bit i acceso = parte il bus in
 *  più i) chi parte e quanto porta. Chi non sale su nessun bus che parte è
 *  rimborsato: non conta. */
export function esitiCombinazioni(gruppi: GruppoConIncasso[], bus: BusSimulato[]): EsitoCombinazione[] {
  const interruttori = bus.reduce((max, b) => (b.interruttore === null ? max : Math.max(max, b.interruttore + 1)), 0);
  const esiti: EsitoCombinazione[] = [];
  for (let combinazione = 0; combinazione < 2 ** interruttori; combinazione++) {
    const partono = bus.filter((b) => b.interruttore === null || (combinazione & (1 << b.interruttore)) !== 0);
    const fuori = new Set(riempiBus(gruppi, partono).senzaPosto.map((g) => g.id));
    let passeggeri = 0;
    let incasso = 0;
    let commissioni = 0;
    for (const g of gruppi) {
      if (fuori.has(g.id) || g.rimborsoInAttesa) continue;
      passeggeri += g.passeggeri;
      incasso += g.incasso;
      commissioni += g.commissioni;
    }
    esiti.push([passeggeri, arrotondaEuro(incasso), arrotondaEuro(commissioni)]);
  }
  return esiti;
}
