import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, prenotazioni, preventiviRichieste, preventiviRisposte, richiesteRimborso, tragitti } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { giornoARoma } from '../../shared/formato.js';
import { lineeDaConfermareService, PREFISSO_LINEA_SENZA_BUS } from '../eventi/linee-da-confermare.service.js';
import { busDellaSimulazione, esitiCombinazioni, type BusInPiu, type EsitoCombinazione } from '../eventi/simulazione-bus.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import { arrotondaEuro } from './calcoli.js';
import { commissioniPer, economiaEventiConclusi, type EconomiaConclusa } from './economia.js';
import { inizioGiornoRoma, oggiRoma } from './periodo.js';
import { aBlocchiDaDb, caricaDatiEventi, prenotazioniComeStatistiche } from './statistiche.service.js';

/** Statistiche › Bus in più e riquadro della pagina Linee: se far partire
 *  più bus, anche sotto il pareggio, porta in guadagno, pareggio o perdita.
 *  Per evento, per tutti gli eventi in vendita e per anno (gennaio-dicembre,
 *  per data dell'evento). Gli eventi passati hanno i numeri veri; quelli
 *  ancora da fare la simulazione (eventi/simulazione-bus.ts), con gli
 *  interruttori scelti nella pagina. I tipi della risposta sono in
 *  packages/frontend/src/api/statistiche.ts. */

/** Come le proposte: un evento resta "da fare" fino a un giorno dopo la sua data. */
const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

const eventoValido = and(isNull(eventi.eliminatoIl), eq(eventi.bozza, false));
const colonneEvento = { id: eventi.id, artista: eventi.artista, citta: eventi.citta, data: eventi.data, bozza: eventi.bozza, eliminatoIl: eventi.eliminatoIl };
type RigaEvento = { id: string; artista: string; citta: string; data: Date };

export type FonteCosto = 'preventivo' | 'quotazione' | null;

export interface BusInPiuConCosto extends BusInPiu {
  /** Il preventivo più basso ricevuto per quel bus, altrimenti il costo della quotazione. */
  costo: number | null;
  fonteCosto: FonteCosto;
  preventivi: number;
}

export interface TragittoSimulato {
  id: string;
  nome: string;
  /** Tutti i passeggeri delle prenotazioni confermate. */
  passeggeri: number;
  inAttesaDiRimborso: number;
  busConfermati: number;
  /** Costo dei bus confermati; un bus senza costo vale la quotazione. */
  costoBusConfermati: number;
  busCostoStimato: number;
  busSenzaCosto: number;
  postiPareggio: number | null;
  busInPiu: BusInPiuConCosto[];
  /** Indice = combinazione degli interruttori (bit i = parte il bus in più i). */
  esiti: EsitoCombinazione[];
}

export interface EventoSimulato {
  id: string;
  artista: string;
  citta: string;
  data: string;
  anno: number;
  tragitti: TragittoSimulato[];
}

export interface EventoConcluso extends EconomiaConclusa {
  id: string;
  artista: string;
  citta: string;
  data: string;
}

async function rimborsiInAttesa(eventoIds: string[]): Promise<Set<string>> {
  const righe = await aBlocchiDaDb(eventoIds, (ids) => db.select({ id: richiesteRimborso.prenotazioneId }).from(richiesteRimborso)
    .innerJoin(prenotazioni, eq(prenotazioni.id, richiesteRimborso.prenotazioneId))
    .where(and(eq(richiesteRimborso.stato, 'IN_ATTESA'), inArray(prenotazioni.eventoId, ids))));
  return new Set(righe.map((r) => r.id));
}

async function simulaEventi(righeEventi: RigaEvento[]): Promise<EventoSimulato[]> {
  const ids = righeEventi.map((e) => e.id);
  if (ids.length === 0) return [];
  const [{ righe, ctx }, inAttesa, righeTragitti, soglia, postiPerBus] = await Promise.all([
    prenotazioniComeStatistiche(inArray(prenotazioni.eventoId, ids)),
    rimborsiInAttesa(ids),
    db.select({ id: tragitti.id, eventoId: tragitti.eventoId, nome: tragitti.nome, preventivoCosto: tragitti.preventivoCosto })
      .from(tragitti).where(and(inArray(tragitti.eventoId, ids), isNull(tragitti.eliminatoIl))).orderBy(asc(tragitti.nome)),
    leggiSogliaOccupazionePareggio(),
    leggiPostiPerBus(),
  ]);
  const rigaPerId = new Map(righe.map((r) => [r.id, r]));
  const commissioniPerPrenotazione = commissioniPer(righe, (r) => r.id, ctx);

  // Un tragitto alla volta: ognuno legge linee, bus, fermate e prenotazioni come le proposte.
  const letture = [];
  for (const t of righeTragitti) {
    const stato = await lineeDaConfermareService.statoPerSimulazione(t.id, soglia, postiPerBus);
    if (stato) letture.push({ t, stato, ...busDellaSimulazione(t.id, stato) });
  }
  const lineeIds = [...new Set(letture.flatMap((l) => l.inPiu.map((b) => b.lineaId)).filter((id): id is string => id !== null))];
  const busVeriIds = letture.flatMap((l) => l.bus.filter((b) => b.interruttore === null && !b.busId.startsWith(PREFISSO_LINEA_SENZA_BUS)).map((b) => b.busId));
  const [risposte, costiBus] = await Promise.all([
    aBlocchiDaDb(lineeIds, (blocco) => db.select({ lineaId: preventiviRichieste.lineaId, prezzo: preventiviRisposte.prezzo }).from(preventiviRisposte)
      .innerJoin(preventiviRichieste, eq(preventiviRichieste.id, preventiviRisposte.richiestaId))
      .where(and(inArray(preventiviRichieste.lineaId, blocco), eq(preventiviRichieste.scopo, 'BUS'), isNull(preventiviRichieste.chiusaIl)))),
    aBlocchiDaDb(busVeriIds, (blocco) => db.select({ id: busFisici.id, costo: busFisici.costo }).from(busFisici).where(inArray(busFisici.id, blocco))),
  ]);
  const prezziPerLinea = new Map<string, number[]>();
  for (const r of risposte) if (r.lineaId) prezziPerLinea.set(r.lineaId, [...(prezziPerLinea.get(r.lineaId) ?? []), Number(r.prezzo)]);
  const costoBus = new Map(costiBus.map((b) => [b.id, b.costo === null ? null : Number(b.costo)]));

  const tragittiPerEvento = new Map<string, TragittoSimulato[]>();
  for (const { t, stato, bus, inPiu } of letture) {
    const quotazione = t.preventivoCosto === null ? null : Number(t.preventivoCosto);
    const confermati = bus.filter((b) => b.interruttore === null);
    let costoBusConfermati = 0;
    let busCostoStimato = 0;
    let busSenzaCosto = 0;
    for (const b of confermati) {
      const costo = costoBus.get(b.busId) ?? null;
      if (costo !== null) costoBusConfermati += costo;
      else if (quotazione !== null) {
        costoBusConfermati += quotazione;
        busCostoStimato += 1;
      } else busSenzaCosto += 1;
    }
    const gruppi = stato.dati.gruppi.map((g) => {
      const riga = rigaPerId.get(g.id);
      return { ...g, incasso: riga?.totale ?? 0, commissioni: commissioniPerPrenotazione.get(g.id) ?? 0, rimborsoInAttesa: inAttesa.has(g.id) };
    });
    const righeTragitto = righe.filter((r) => r.tragittoId === t.id);
    const simulato: TragittoSimulato = {
      id: t.id,
      nome: t.nome,
      passeggeri: righeTragitto.reduce((s, r) => s + r.passeggeri, 0),
      inAttesaDiRimborso: righeTragitto.filter((r) => inAttesa.has(r.id)).reduce((s, r) => s + r.passeggeri, 0),
      busConfermati: confermati.length,
      costoBusConfermati: arrotondaEuro(costoBusConfermati),
      busCostoStimato,
      busSenzaCosto,
      postiPareggio: stato.dati.postiPareggio,
      busInPiu: inPiu.map((b): BusInPiuConCosto => {
        const prezzi = b.lineaId ? prezziPerLinea.get(b.lineaId) ?? [] : [];
        return prezzi.length > 0
          ? { ...b, costo: Math.min(...prezzi), fonteCosto: 'preventivo', preventivi: prezzi.length }
          : { ...b, costo: quotazione, fonteCosto: quotazione === null ? null : 'quotazione', preventivi: 0 };
      }),
      esiti: esitiCombinazioni(gruppi, bus),
    };
    tragittiPerEvento.set(t.eventoId, [...(tragittiPerEvento.get(t.eventoId) ?? []), simulato]);
  }

  return righeEventi.map((e) => ({
    id: e.id,
    artista: e.artista,
    citta: e.citta,
    data: e.data.toISOString(),
    anno: giornoARoma(e.data).anno,
    // I tragitti senza prenotati, bus o bus in più non hanno niente da mostrare.
    tragitti: (tragittiPerEvento.get(e.id) ?? []).filter((t) => t.passeggeri > 0 || t.busConfermati > 0 || t.busInPiu.length > 0),
  }));
}

export const simulazioneBusService = {
  /** Gli eventi in vendita (di ogni anno) e i conti veri degli eventi già
   *  passati dell'anno scelto. */
  async anno(anno: number) {
    const confine = new Date(Date.now() - UN_GIORNO_MS);
    const inizio = inizioGiornoRoma({ anno, mese: 1, giorno: 1 });
    const fine = inizioGiornoRoma({ anno: anno + 1, mese: 1, giorno: 1 });
    const annoRoma = sql<number>`extract(year from ((${eventi.data} at time zone 'UTC') at time zone 'Europe/Rome'))::int`.mapWith(Number);
    const [inVendita, passati, anniEventi] = await Promise.all([
      db.select(colonneEvento).from(eventi).where(and(eventoValido, gte(eventi.data, confine))).orderBy(asc(eventi.data)),
      db.select(colonneEvento).from(eventi).where(and(eventoValido, gte(eventi.data, inizio), lt(eventi.data, fine), lt(eventi.data, confine))).orderBy(asc(eventi.data)),
      db.selectDistinct({ anno: annoRoma }).from(eventi).where(eventoValido),
    ]);

    const idsPassati = passati.map((e) => e.id);
    const [simulati, datiPassati, rimborsiPassati] = await Promise.all([
      simulaEventi(inVendita),
      caricaDatiEventi(idsPassati),
      rimborsiInAttesa(idsPassati),
    ]);
    const economia = economiaEventiConclusi(idsPassati, datiPassati, rimborsiPassati);

    return {
      anno,
      // Gli anni con almeno un evento, più quello di oggi e quello scelto.
      anni: [...new Set([...anniEventi.map((r) => r.anno), oggiRoma().anno, anno])].sort((a, b) => b - a),
      inVendita: simulati.filter((e) => e.tragitti.length > 0),
      conclusi: passati
        .map((e): EventoConcluso => ({ id: e.id, artista: e.artista, citta: e.citta, data: e.data.toISOString(), ...economia.get(e.id)! }))
        .filter((e) => e.passeggeri > 0 || e.nonPartiti > 0 || e.bus > 0),
    };
  },

  /** Un evento per la pagina Linee; null se è già passato (lì non c'è più niente da simulare). */
  async evento(eventoId: string): Promise<EventoSimulato | null> {
    const [e] = await db.select(colonneEvento).from(eventi).where(eq(eventi.id, eventoId)).limit(1);
    if (!e || e.eliminatoIl) throw new NonTrovato('Evento');
    if (e.bozza || e.data.getTime() < Date.now() - UN_GIORNO_MS) return null;
    const [simulato] = await simulaEventi([e]);
    return simulato;
  },
};
