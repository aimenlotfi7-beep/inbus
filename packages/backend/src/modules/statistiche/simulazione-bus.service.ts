import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, prenotazioni, preventiviRichieste, preventiviRisposte, richiesteRimborso, tragitti } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { giornoARoma } from '../../shared/formato.js';
import { lineeDaConfermareService } from '../eventi/linee-da-confermare.service.js';
import { busDellaSimulazione, esitiCombinazioni, lineeEBus, type BusSimulato, type TragittoSimulato } from '../eventi/simulazione-bus.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import type { RegolaCompenso } from '../collaboratori/compenso.js';
import { commissioniPer, sommaDaIncassare, sommaPagati, tragittiConclusi } from './economia.js';
import { inizioGiornoRoma, oggiRoma } from './periodo.js';
import { aBlocchiDaDb, caricaDatiEventi, leggiCompensi, prenotazioniComeStatistiche } from './statistiche.service.js';

/** Statistiche › Bus in più e riquadro della pagina Linee: incasso, spesa e
 *  risultato dei bus, totali, per linea e per bus, per evento, per tutti gli
 *  eventi in vendita e per anno (gennaio-dicembre, per data dell'evento).
 *  Gli eventi passati hanno i numeri veri; quelli ancora da fare la
 *  simulazione (eventi/simulazione-bus.ts), con gli interruttori scelti nella
 *  pagina. I tipi della risposta sono in packages/frontend/src/api/statistiche.ts. */

/** Come le proposte: un evento resta "da fare" fino a un giorno dopo la sua data. */
const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

const eventoValido = and(isNull(eventi.eliminatoIl), eq(eventi.bozza, false));
const colonneEvento = { id: eventi.id, artista: eventi.artista, citta: eventi.citta, data: eventi.data, bozza: eventi.bozza, eliminatoIl: eventi.eliminatoIl };
type RigaEvento = { id: string; artista: string; citta: string; data: Date };

export interface EventoSimulato {
  id: string;
  artista: string;
  citta: string;
  data: string;
  anno: number;
  /** Il compenso del responsabile dell'evento: il gestionale lo calcola sulla
   *  combinazione di bus scelta (collaboratori/compenso.ts). */
  compenso: RegolaCompenso | null;
  tragitti: TragittoSimulato[];
}

async function rimborsiInAttesa(eventoIds: string[]): Promise<Set<string>> {
  const righe = await aBlocchiDaDb(eventoIds, (ids) => db.select({ id: richiesteRimborso.prenotazioneId }).from(richiesteRimborso)
    .innerJoin(prenotazioni, eq(prenotazioni.id, richiesteRimborso.prenotazioneId))
    .where(and(eq(richiesteRimborso.stato, 'IN_ATTESA'), inArray(prenotazioni.eventoId, ids))));
  return new Set(righe.map((r) => r.id));
}

const eventoInRisposta = (e: RigaEvento, tragittiEvento: TragittoSimulato[], compensi: Map<string, RegolaCompenso>): EventoSimulato => ({
  id: e.id,
  artista: e.artista,
  citta: e.citta,
  data: e.data.toISOString(),
  anno: giornoARoma(e.data).anno,
  compenso: compensi.get(e.id) ?? null,
  tragitti: tragittiEvento,
});

async function simulaEventi(righeEventi: RigaEvento[]): Promise<EventoSimulato[]> {
  const ids = righeEventi.map((e) => e.id);
  if (ids.length === 0) return [];
  const [{ righe, ctx }, inAttesa, righeTragitti, soglia, postiPerBus, compensi] = await Promise.all([
    prenotazioniComeStatistiche(inArray(prenotazioni.eventoId, ids)),
    rimborsiInAttesa(ids),
    db.select({ id: tragitti.id, eventoId: tragitti.eventoId, nome: tragitti.nome, preventivoCosto: tragitti.preventivoCosto })
      .from(tragitti).where(and(inArray(tragitti.eventoId, ids), isNull(tragitti.eliminatoIl))).orderBy(asc(tragitti.nome)),
    leggiSogliaOccupazionePareggio(),
    leggiPostiPerBus(),
    leggiCompensi(ids),
  ]);
  const rigaPerId = new Map(righe.map((r) => [r.id, r]));
  const promoterPerPrenotazione = commissioniPer(righe, (r) => r.id, ctx, { quoteWhiteLabel: false });

  // Un tragitto alla volta: ognuno legge linee, bus, fermate e prenotazioni come le proposte.
  const letture = [];
  for (const t of righeTragitti) {
    const stato = await lineeDaConfermareService.statoPerSimulazione(t.id, soglia, postiPerBus);
    if (stato) letture.push({ t, stato, bus: busDellaSimulazione(t.id, stato) });
  }
  const lineeIds = [...new Set(letture.flatMap((l) => l.bus.map((b) => b.lineaIdPreventivi)).filter((id): id is string => id !== null))];
  const busVeriIds = letture.flatMap((l) => l.bus.filter((b) => b.tipo === 'confermato').map((b) => b.busId));
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
  for (const { t, stato, bus } of letture) {
    const quotazione = t.preventivoCosto === null ? null : Number(t.preventivoCosto);
    const gruppi = stato.dati.gruppi.map((g) => {
      const riga = rigaPerId.get(g.id);
      return {
        ...g,
        // Solo quanto è stato pagato davvero; il saldo che manca a parte.
        incasso: riga?.pagato ?? 0,
        daIncassare: riga ? Math.max(0, riga.totale - riga.pagato) : 0,
        promoter: promoterPerPrenotazione.get(g.id) ?? 0,
        whiteLabel: Number(riga?.quotaWhiteLabel ?? 0),
        rimborsoInAttesa: inAttesa.has(g.id),
      };
    });
    const { linee, bus: busRisposta } = lineeEBus(bus, stato.dati.fermateOrdinate.map((f) => f.citta), (b): Pick<BusSimulato, 'costo' | 'fonteCosto' | 'preventivi'> => {
      const registrato = b.tipo === 'confermato' ? costoBus.get(b.busId) ?? null : null;
      if (registrato !== null) return { costo: registrato, fonteCosto: 'bus', preventivi: 0 };
      const prezzi = b.lineaIdPreventivi ? prezziPerLinea.get(b.lineaIdPreventivi) ?? [] : [];
      if (prezzi.length > 0) return { costo: Math.min(...prezzi), fonteCosto: 'preventivo', preventivi: prezzi.length };
      return { costo: quotazione, fonteCosto: quotazione === null ? null : 'quotazione', preventivi: 0 };
    });
    const righeTragitto = righe.filter((r) => r.tragittoId === t.id);
    const passeggeri = righeTragitto.reduce((s, r) => s + r.passeggeri, 0);
    // I tragitti senza prenotati né bus non hanno niente da mostrare.
    if (passeggeri === 0 && busRisposta.length === 0) continue;
    tragittiPerEvento.set(t.eventoId, [...(tragittiPerEvento.get(t.eventoId) ?? []), {
      id: t.id,
      nome: t.nome,
      passeggeri,
      inAttesaDiRimborso: righeTragitto.filter((r) => inAttesa.has(r.id)).reduce((s, r) => s + r.passeggeri, 0),
      incasso: sommaPagati(righeTragitto.filter((r) => !inAttesa.has(r.id))),
      daIncassare: sommaDaIncassare(righeTragitto.filter((r) => !inAttesa.has(r.id))),
      linee,
      bus: busRisposta,
      esiti: esitiCombinazioni(gruppi, bus),
    }]);
  }
  return righeEventi.map((e) => eventoInRisposta(e, tragittiPerEvento.get(e.id) ?? [], compensi));
}

export const simulazioneBusService = {
  /** Gli eventi in vendita (di ogni anno) e i conti veri degli eventi già
   *  passati dell'anno scelto, nella stessa forma. */
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
    const conclusi = tragittiConclusi(idsPassati, datiPassati, rimborsiPassati);

    return {
      anno,
      // Gli anni con almeno un evento, più quello di oggi e quello scelto.
      anni: [...new Set([...anniEventi.map((r) => r.anno), oggiRoma().anno, anno])].sort((a, b) => b - a),
      inVendita: simulati.filter((e) => e.tragitti.length > 0),
      conclusi: passati.map((e) => eventoInRisposta(e, conclusi.get(e.id) ?? [], datiPassati.compensi ?? new Map())).filter((e) => e.tragitti.length > 0),
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
