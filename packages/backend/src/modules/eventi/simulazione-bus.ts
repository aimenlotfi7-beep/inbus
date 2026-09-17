import { arrotondaEuro } from '../statistiche/calcoli.js';
import { riempiBus, type BusDaRiempire, type GruppoPasseggeri } from '../prenotazioni/riempimento-bus.js';
import { passiBusInPiu, PREFISSO_LINEA_SENZA_BUS, type StatoProposte } from './linee-da-confermare.service.js';

/** Simulazione economica dei bus (Statistiche › Bus in più e pagina Linee).
 *  Nessun database qui: si prova da sola in simulazione-bus.test.ts.
 *
 *  Regole decise dal proprietario (settembre 2026): serve a capire se
 *  conviene far partire un bus per chi resta fuori, anche sotto il pareggio
 *  (per immagine o altre esigenze), guardando incasso e spesa totali, per
 *  linea e per bus.
 *  - i bus in più sono, in ordine: le linee confermate ancora senza bus, le
 *    proposte da confermare, poi altri bus con la stessa regola delle
 *    proposte finché resta qualcuno che un bus può portare;
 *  - ogni bus in più ha un interruttore «Parte / Non parte»: è solo una
 *    simulazione, non conferma niente;
 *  - chi non trova posto sui bus che partono viene rimborsato: il suo incasso
 *    e le sue commissioni non contano;
 *  - incassato (quanto è stato pagato davvero: di un acconto solo l'acconto)
 *    e previsto (con i saldi che mancano) sono voci separate; il risultato
 *    previsto è quello in evidenza, quello a oggi in piccolo;
 *  - spesa = costo dei bus che partono + commissioni dei promoter + quote
 *    White Label dei passeggeri che partono;
 *  - chi sale e su quale bus lo decide la regola dello smistamento (gruppi
 *    interi, solo sui bus che si fermano alla loro fermata): per questo ogni
 *    combinazione di interruttori si calcola qui, e la pagina sceglie quella
 *    accesa. */

/** Bus in più simulati al massimo per tragitto: le combinazioni sono 2^n. */
export const MAX_BUS_IN_PIU = 8;

export interface GruppoConIncasso extends GruppoPasseggeri {
  /** Quanto ha pagato davvero finora: per un acconto non saldato solo l'acconto
   *  (proprietario, settembre 2026). */
  incasso: number;
  /** Il saldo che manca ancora (0 se ha pagato tutto): non conta nel risultato. */
  daIncassare: number;
  /** Commissione del promoter su questa prenotazione. */
  promoter: number;
  /** Quota dell'organizzatore White Label. */
  whiteLabel: number;
  /** Con un rimborso in attesa tiene il suo posto ma non conta: né passeggeri né incasso. */
  rimborsoInAttesa: boolean;
}

/** confermato: bus vero; linea-senza-bus: linea confermata senza bus;
 *  proposta: da confermare (raggiunge il pareggio); sotto-pareggio: bus in
 *  più che non lo raggiunge; senza-bus: passeggeri di un viaggio passato mai
 *  smistato (contano, ma non sono su un bus). */
export type TipoBusSimulato = 'confermato' | 'linea-senza-bus' | 'proposta' | 'sotto-pareggio' | 'senza-bus';

/** Un bus nello smistamento simulato. `interruttore` è la sua posizione tra i
 *  bus in più, null per un bus che parte sempre. */
export interface BusDellaSimulazione extends BusDaRiempire {
  interruttore: number | null;
  /** Stabile tra un caricamento e l'altro: la pagina ci ricorda l'interruttore. */
  chiave: string;
  tipo: TipoBusSimulato;
  riferimento: string | null;
  lineaChiave: string;
  lineaNome: string;
  /** La riga di `linee` di cui leggere i preventivi (proposte e linee senza bus). */
  lineaIdPreventivi: string | null;
}

/** Nella risposta: una linea con le sue fermate in ordine. */
export interface LineaSimulata { chiave: string; nome: string; fermate: string[] }

export interface BusSimulato {
  chiave: string;
  /** "Bus 2": numerato dentro la sua linea. */
  nome: string;
  riferimento: string | null;
  tipo: TipoBusSimulato;
  /** Posizione in `linee`. */
  linea: number;
  posti: number;
  interruttore: number | null;
  /** Costo del bus: quello registrato, il preventivo più basso o la quotazione; null se non c'è. */
  costo: number | null;
  fonteCosto: 'bus' | 'preventivo' | 'quotazione' | null;
  preventivi: number;
}

/** Per un bus in una combinazione: [passeggeri, incasso (pagato davvero),
 *  commissioni promoter, quote White Label, saldi ancora da incassare]. */
export type EsitoBus = [number, number, number, number, number];

export interface TragittoSimulato {
  id: string;
  nome: string;
  /** Tutti i passeggeri delle prenotazioni confermate (anche chi resta a terra). */
  passeggeri: number;
  inAttesaDiRimborso: number;
  /** Pagato davvero da tutte le prenotazioni confermate, senza quelle con un
   *  rimborso in attesa. */
  incasso: number;
  /** I loro saldi che mancano: con `incasso` è il previsto; meno quello di chi
   *  parte, è quanto vale chi resta a terra. */
  daIncassare: number;
  linee: LineaSimulata[];
  bus: BusSimulato[];
  /** esiti[combinazione][bus]: combinazione = bit i acceso se parte il bus in più i. */
  esiti: EsitoBus[][];
}

const stesseFermate = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** I bus del tragitto per la simulazione: i confermati, poi i bus in più
 *  (al massimo `massimo`). */
export function busDellaSimulazione(
  tragittoId: string,
  stato: Pick<StatoProposte, 'dati' | 'necessarie' | 'bozze' | 'principale' | 'infoBus'>,
  massimo = MAX_BUS_IN_PIU,
): BusDellaSimulazione[] {
  const { dati } = stato;
  let interruttori = 0;
  const bus: BusDellaSimulazione[] = dati.bus.map((b) => {
    const info = stato.infoBus.get(b.busId);
    const lineaId = info?.lineaId ?? b.busId;
    const comune = { ...b, riferimento: info?.riferimento ?? null, lineaChiave: `linea:${lineaId}`, lineaNome: info?.lineaNome ?? 'Linea' };
    if (!b.busId.startsWith(PREFISSO_LINEA_SENZA_BUS)) {
      return { ...comune, interruttore: null, chiave: b.busId, tipo: 'confermato', lineaIdPreventivi: null };
    }
    const interruttore = interruttori < massimo ? interruttori++ : null;
    return { ...comune, interruttore, chiave: `linea:${lineaId}`, tipo: 'linea-senza-bus', lineaIdPreventivi: lineaId };
  });

  if (dati.fermateOrdinate.length === 0 || interruttori >= massimo) return bus;
  const cittaDi = new Map(dati.fermateOrdinate.map((f) => [f.id, f.citta]));
  const { passi } = passiBusInPiu(dati, 1, massimo - interruttori);
  passi.forEach((passo, i) => {
    const diBus = passo.proposta.tipo === 'bus';
    const proposta = i < stato.necessarie.length;
    const bozza = proposta ? stato.bozze[i] : undefined;
    const salvata = bozza && stesseFermate(bozza.fermateIds, passo.proposta.fermateIds) ? bozza : undefined;
    // Un bus in più va sulla linea principale; una linea nuova è una linea a sé.
    const linea = diBus && stato.principale
      ? { chiave: `linea:${stato.principale.id}`, nome: stato.principale.nome }
      : {
        chiave: `linea-nuova:${passo.proposta.fermateIds.join('-')}`,
        nome: salvata?.nome ?? (diBus ? 'Linea nuova' : `Linea nuova da ${cittaDi.get(passo.proposta.fermateIds[0]) ?? 'una fermata successiva'}`),
      };
    bus.push({
      ...passo.bus,
      busId: `bus-in-piu-${i + 1}`,
      interruttore: interruttori++,
      chiave: salvata ? `proposta:${salvata.id}` : `${tragittoId}:bus-in-piu:${i + 1}`,
      tipo: proposta ? 'proposta' : 'sotto-pareggio',
      riferimento: null,
      lineaChiave: linea.chiave,
      lineaNome: linea.nome,
      lineaIdPreventivi: salvata?.id ?? null,
    });
  });
  return bus;
}

/** Per ogni combinazione di interruttori (il bit i acceso = parte il bus in
 *  più i), per ogni bus: chi parte su quel bus e quanto porta. Un bus che non
 *  parte ha tutto a zero; chi non sale su nessun bus è rimborsato e non conta. */
export function esitiCombinazioni(gruppi: GruppoConIncasso[], bus: BusDellaSimulazione[]): EsitoBus[][] {
  const interruttori = bus.reduce((max, b) => (b.interruttore === null ? max : Math.max(max, b.interruttore + 1)), 0);
  const posizione = new Map(bus.map((b, i) => [b.busId, i]));
  const esiti: EsitoBus[][] = [];
  for (let combinazione = 0; combinazione < 2 ** interruttori; combinazione++) {
    const partono = bus.filter((b) => b.interruttore === null || (combinazione & (1 << b.interruttore)) !== 0);
    const { assegnazioni } = riempiBus(gruppi, partono);
    const perBus = bus.map((): EsitoBus => [0, 0, 0, 0, 0]);
    for (const g of gruppi) {
      const busId = g.busId ?? assegnazioni.get(g.id);
      const i = busId ? posizione.get(busId) : undefined;
      if (i === undefined || g.rimborsoInAttesa) continue;
      const e = perBus[i];
      e[0] += g.passeggeri;
      e[1] += g.incasso;
      e[2] += g.promoter;
      e[3] += g.whiteLabel;
      e[4] += g.daIncassare;
    }
    esiti.push(perBus.map(([p, ...euro]) => [p, ...euro.map(arrotondaEuro)] as EsitoBus));
  }
  return esiti;
}

/** Linee e bus della risposta, con i bus numerati dentro la loro linea
 *  e le fermate delle linee nell'ordine del percorso. */
export function lineeEBus(
  bus: BusDellaSimulazione[],
  ordineCitta: string[],
  costo: (b: BusDellaSimulazione) => Pick<BusSimulato, 'costo' | 'fonteCosto' | 'preventivi'>,
): { linee: LineaSimulata[]; bus: BusSimulato[] } {
  const linee: LineaSimulata[] = [];
  const contati = new Map<string, number>();
  const risultato = bus.map((b): BusSimulato => {
    let indice = linee.findIndex((l) => l.chiave === b.lineaChiave);
    if (indice < 0) {
      linee.push({ chiave: b.lineaChiave, nome: b.lineaNome, fermate: ordineCitta.filter((c) => b.fermate.has(c)) });
      indice = linee.length - 1;
    }
    const numero = (contati.get(b.lineaChiave) ?? 0) + 1;
    contati.set(b.lineaChiave, numero);
    return {
      chiave: b.chiave, nome: `Bus ${numero}`, riferimento: b.riferimento, tipo: b.tipo, linea: indice, posti: b.postiBus,
      interruttore: b.interruttore, ...costo(b),
    };
  });
  return { linee, bus: risultato };
}
