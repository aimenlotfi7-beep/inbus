import { calcolaCommissioneRighe, type RegolaCompensoPromoter } from '../../shared/commissioneRighe.js';
import type { BusSimulato, EsitoBus, LineaSimulata, TragittoSimulato } from '../eventi/simulazione-bus.js';
import { arrotondaEuro, raggruppa, type CampagnaFonte } from './calcoli.js';
import { calcolaCompenso, type RegolaCompenso } from '../collaboratori/compenso.js';

/** I conti economici delle statistiche che non leggono il database (i dati
 *  li prepara statistiche.service.ts): commissioni, economia per evento,
 *  linee. Si provano da soli in economia.test.ts. */

export interface PrenotazioneStatistica {
  id: string;
  /** L'ordine del carrello o del bundle (null per una prenotazione singola). */
  ordineId: string | null;
  eventoId: string;
  tragittoId: string;
  fermataCitta: string;
  busId: string | null;
  utenteId: string;
  passeggeri: number;
  /** Valore della prenotazione: per un acconto non ancora saldato è già il
   *  prezzo intero previsto, non l'acconto (vedi statistiche.service.ts). */
  totale: number;
  /** Quanto è entrato davvero finora. */
  pagato: number;
  sconto: string;
  scontoBundle: string | null;
  couponCodice: string | null;
  promoterCodice: string | null;
  /** Regola del compenso del promoter fissata alla vendita (null per le vendite senza promoter). */
  compensoPromoter: RegolaCompensoPromoter | null;
  canaleVendita: string;
  whiteLabelId: string | null;
  quotaWhiteLabel: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  offertaId: string | null;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  saldoPagato: boolean;
  scadenzaSaldo: Date | null;
  creataIl: Date;
  eventoData: Date;
}

export type CompensoCoupon = {
  compensoTipo: 'PERCENTUALE' | 'FISSO' | null;
  compensoValore: string | null;
  compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null;
};

export interface ContestoFonti {
  campagne: CampagnaFonte[];
  nomiPromoter: Map<string, string>;
  idPromoter: Map<string, string>;
  nomiPromoterPerId: Map<string, string>;
  percentualiPromoter: Map<string, number>;
  nomiWhiteLabel: Map<string, string>;
  coupon: Map<string, CompensoCoupon & { promoterId: string | null }>;
  /** Offerta → la campagna collegata (solo le offerte che ne hanno una). */
  campagnaDiOfferta: Map<string, string>;
}

export interface StruttureEventi {
  /** preventivoCosto: il costo di un bus della quotazione (stima dei bus senza costo). */
  tragitti: { id: string; eventoId: string; nome: string; attivo: boolean; preventivoPostiBus: number | null; preventivoCosto?: string | null }[];
  linee: { id: string; nome: string; tragittoId: string; daConfermare: boolean }[];
  fermateLinee: { lineaId: string; citta: string }[];
  bus: { id: string; lineaId: string | null; costo: string | null; postiBus: number | null }[];
}

export interface DatiEventi {
  righe: PrenotazioneStatistica[];
  strutture: StruttureEventi;
  ctx: ContestoFonti;
  /** Soglia di pareggio, in % dei posti (Impostazioni). */
  soglia: number;
  /** Posti di un bus quando il preventivo non li dice (Impostazioni). */
  postiPerBus: number;
  /** Il compenso del responsabile operativo, per gli eventi che ne hanno uno. */
  compensi?: Map<string, RegolaCompenso>;
}

export const sommaPasseggeri = (righe: { passeggeri: number }[]) => righe.reduce((s, r) => s + r.passeggeri, 0);
export const sommaTotali = (righe: { totale: number | string }[]) => arrotondaEuro(righe.reduce((s, r) => s + Number(r.totale), 0));

// ---------------------------------------------------------------- Commissioni

/** Commissioni per gruppo (evento, fonte, linea…). Per i promoter la stessa
 *  regola del report Campagne: riga per riga con il compenso del coupon se ce
 *  l'ha (calcolaCommissioneRighe), arrotondata per promoter. Vale la regola
 *  fissata sulla prenotazione alla vendita (percentuale e compenso del coupon
 *  di allora), anche se poi il promoter è stato eliminato; solo le vendite
 *  che non ce l'hanno usano quelli di oggi, e un codice promoter che non
 *  esiste più non matura commissione. Con quoteWhiteLabel
 *  (di serie) si aggiunge la quota dell'organizzatore fissata sulla
 *  prenotazione al momento della vendita; va tolta quando si mostra solo
 *  quanto spetta ai promoter. */
export function commissioniPer(
  righe: PrenotazioneStatistica[],
  gruppo: (r: PrenotazioneStatistica) => string,
  ctx: Pick<ContestoFonti, 'percentualiPromoter' | 'coupon'>,
  opzioni: { quoteWhiteLabel?: boolean } = {},
): Map<string, number> {
  const conQuote = opzioni.quoteWhiteLabel ?? true;
  const risultato = new Map<string, number>();
  const perPromoter = new Map<string, { gruppo: string; percentuale: number; righe: { totale: number; passeggeri: number; couponCodice: string | null; ordineId: string | null; regola: RegolaCompensoPromoter | null }[] }>();
  for (const r of righe) {
    const g = gruppo(r);
    if (conQuote && r.quotaWhiteLabel) risultato.set(g, (risultato.get(g) ?? 0) + Number(r.quotaWhiteLabel));
    if (!r.promoterCodice) continue;
    const percentualeDiOggi = ctx.percentualiPromoter.get(r.promoterCodice);
    if (percentualeDiOggi === undefined && !r.compensoPromoter) continue;
    const chiave = `${g} ${r.promoterCodice}`;
    const voce = perPromoter.get(chiave) ?? { gruppo: g, percentuale: percentualeDiOggi ?? 0, righe: [] };
    voce.righe.push({ totale: r.totale, passeggeri: r.passeggeri, couponCodice: r.couponCodice, ordineId: r.ordineId, regola: r.compensoPromoter });
    perPromoter.set(chiave, voce);
  }
  // Un ordine con più eventi paga il compenso fisso "per acquisto" una volta
  // sola, nel primo gruppo in cui compare.
  const acquistiContati = new Set<string>();
  for (const v of perPromoter.values()) {
    risultato.set(v.gruppo, (risultato.get(v.gruppo) ?? 0) + calcolaCommissioneRighe(v.righe, ctx.coupon, v.percentuale, acquistiContati));
  }
  for (const [g, n] of risultato) risultato.set(g, arrotondaEuro(n));
  return risultato;
}

// ---------------------------------------------------------------- Economia per evento

export interface EconomiaEvento {
  passeggeri: number;
  prenotazioni: number;
  /** Previsto: un acconto non saldato conta già per il prezzo intero. */
  incasso: number;
  /** Pagato davvero finora (di un acconto solo l'acconto). */
  incassato: number;
  bus: number;
  busSenzaCosto: number;
  costoBus: number;
  commissioni: number;
  /** Compenso del responsabile operativo (0 senza responsabile): previsto e a oggi. */
  compenso: number;
  compensoAOggi: number;
  /** incasso − costo dei bus − commissioni (promoter e quote White Label) − compenso del responsabile. */
  margine: number;
  /** Lo stesso con quanto è stato pagato davvero: incassato − costo dei bus − commissioni − compenso a oggi. */
  margineAOggi: number;
  postiSuiBus: number;
  /** Passeggeri dei tragitti con posti sui bus: servono al riempimento. */
  passeggeriConBus: number;
  /** Passeggeri dei tragitti che non hanno nessun bus: il loro costo manca. */
  passeggeriSenzaBus: number;
}

/** Il costo dei bus è completo se ci sono bus, hanno tutti un costo e nessun
 *  tragitto con passeggeri è rimasto senza bus. */
export const costoCompleto = (e: EconomiaEvento) => e.bus > 0 && e.busSenzaCosto === 0 && e.passeggeriSenzaBus === 0;
/** Evento con passeggeri il cui margine è più alto del vero: mancano dei costi. */
export const costiMancanti = (e: EconomiaEvento) => e.passeggeri > 0 && !costoCompleto(e);

export function economiaEventi(eventoIds: string[], dati: DatiEventi): Map<string, EconomiaEvento> {
  const risultato = new Map<string, EconomiaEvento>(eventoIds.map((id) => [id, {
    passeggeri: 0, prenotazioni: 0, incasso: 0, incassato: 0, bus: 0, busSenzaCosto: 0, costoBus: 0, commissioni: 0,
    compenso: 0, compensoAOggi: 0, margine: 0, margineAOggi: 0,
    postiSuiBus: 0, passeggeriConBus: 0, passeggeriSenzaBus: 0,
  }]));
  const eventoDiTragitto = new Map(dati.strutture.tragitti.map((t) => [t.id, t.eventoId]));
  const tragittoDiLinea = new Map(dati.strutture.linee.map((l) => [l.id, l.tragittoId]));
  const busPerTragitto = new Map<string, number>();
  const postiPerTragitto = new Map<string, number>();
  for (const b of dati.strutture.bus) {
    const tragittoId = b.lineaId ? tragittoDiLinea.get(b.lineaId) : undefined;
    const e = tragittoId ? risultato.get(eventoDiTragitto.get(tragittoId) ?? '') : undefined;
    if (!tragittoId || !e) continue;
    e.bus += 1;
    if (b.costo === null) e.busSenzaCosto += 1;
    else e.costoBus += Number(b.costo);
    e.postiSuiBus += b.postiBus ?? 0;
    busPerTragitto.set(tragittoId, (busPerTragitto.get(tragittoId) ?? 0) + 1);
    postiPerTragitto.set(tragittoId, (postiPerTragitto.get(tragittoId) ?? 0) + (b.postiBus ?? 0));
  }
  for (const r of dati.righe) {
    const e = risultato.get(r.eventoId);
    if (!e) continue;
    e.passeggeri += r.passeggeri;
    e.prenotazioni += 1;
    e.incasso += r.totale;
    e.incassato += r.pagato;
    if ((postiPerTragitto.get(r.tragittoId) ?? 0) > 0) e.passeggeriConBus += r.passeggeri;
    if (!busPerTragitto.has(r.tragittoId)) e.passeggeriSenzaBus += r.passeggeri;
  }
  const commissioni = commissioniPer(dati.righe, (r) => r.eventoId, dati.ctx);
  for (const [id, e] of risultato) {
    e.incasso = arrotondaEuro(e.incasso);
    e.incassato = arrotondaEuro(e.incassato);
    e.costoBus = arrotondaEuro(e.costoBus);
    e.commissioni = commissioni.get(id) ?? 0;
    const margine = arrotondaEuro(e.incasso - e.costoBus - e.commissioni);
    const margineAOggi = arrotondaEuro(e.incassato - e.costoBus - e.commissioni);
    // Il compenso del responsabile si calcola sui numeri PRIMA di togliere
    // sé stesso (la percentuale sul margine è sul margine dell'evento).
    const regola = dati.compensi?.get(id);
    const compenso = regola ? calcolaCompenso(regola, { incasso: e.incasso, incassato: e.incassato, margine, margineAOggi }) : { previsto: 0, aOggi: 0 };
    e.compenso = compenso.previsto;
    e.compensoAOggi = compenso.aOggi;
    e.margine = arrotondaEuro(margine - compenso.previsto);
    e.margineAOggi = arrotondaEuro(margineAOggi - compenso.aOggi);
  }
  return risultato;
}

// ---------------------------------------------------------------- Eventi passati (simulazione dei bus)

/** Quanto è stato pagato davvero: di un acconto non saldato solo l'acconto. */
export const sommaPagati = (righe: { pagato: number }[]) => arrotondaEuro(righe.reduce((s, r) => s + r.pagato, 0));
/** I saldi che mancano: prezzo previsto meno quanto è stato pagato. */
export const sommaDaIncassare = (righe: { totale: number; pagato: number }[]) => arrotondaEuro(righe.reduce((s, r) => s + Math.max(0, r.totale - r.pagato), 0));

/** Chi è partito: [passeggeri, incasso pagato davvero, commissioni promoter, quote White Label, saldi da incassare]. */
function esitoRighe(righe: PrenotazioneStatistica[], promoter: number): EsitoBus {
  return [
    sommaPasseggeri(righe),
    sommaPagati(righe),
    promoter,
    arrotondaEuro(righe.reduce((s, r) => s + Number(r.quotaWhiteLabel ?? 0), 0)),
    sommaDaIncassare(righe),
  ];
}

/** I conti veri di eventi già passati, per linea e per bus, nella stessa
 *  forma della simulazione (regola del proprietario, settembre 2026: chi non
 *  parte viene rimborsato, e nessun rimborso conta). Su ogni bus conta chi
 *  c'è salito; chi è rimasto senza bus e chi ha un rimborso in attesa no. Un
 *  tragitto in cui lo smistamento non ha messo nessuno sui bus (viaggi di
 *  prima dello smistamento) conta tutti i suoi prenotati, in una riga
 *  "senza bus". Un bus senza costo vale il costo della quotazione.
 *  L'incasso è quanto è stato pagato davvero (di un acconto solo l'acconto). */
export function tragittiConclusi(eventoIds: string[], dati: DatiEventi, rimborsiInAttesa: Set<string>): Map<string, TragittoSimulato[]> {
  const risultato = new Map<string, TragittoSimulato[]>(eventoIds.map((id) => [id, []]));
  const righePerTragitto = raggruppa(dati.righe, (r) => r.tragittoId);
  const busPerLinea = raggruppa(dati.strutture.bus.filter((b) => b.lineaId !== null), (b) => b.lineaId!);
  const cittaPerLinea = raggruppa(dati.strutture.fermateLinee, (f) => f.lineaId);
  const partite = dati.righe.filter((r) => !rimborsiInAttesa.has(r.id));
  const promoterPerBus = commissioniPer(partite.filter((r) => r.busId), (r) => r.busId!, dati.ctx, { quoteWhiteLabel: false });

  for (const t of dati.strutture.tragitti) {
    const delEvento = risultato.get(t.eventoId);
    if (!delEvento) continue;
    const righe = righePerTragitto.get(t.id) ?? [];
    const partiteTragitto = righe.filter((r) => !rimborsiInAttesa.has(r.id));
    const quotazione = t.preventivoCosto ? Number(t.preventivoCosto) : null;
    const linee: LineaSimulata[] = [];
    const bus: BusSimulato[] = [];
    const esito: EsitoBus[] = [];
    for (const l of dati.strutture.linee.filter((x) => x.tragittoId === t.id)) {
      const busLinea = busPerLinea.get(l.id) ?? [];
      if (busLinea.length === 0) continue;
      linee.push({ chiave: `linea:${l.id}`, nome: l.nome, fermate: (cittaPerLinea.get(l.id) ?? []).map((f) => f.citta) });
      busLinea.forEach((b, i) => {
        const costo: Pick<BusSimulato, 'costo' | 'fonteCosto'> = b.costo !== null
          ? { costo: Number(b.costo), fonteCosto: 'bus' }
          : { costo: quotazione, fonteCosto: quotazione === null ? null : 'quotazione' };
        bus.push({ chiave: b.id, nome: `Bus ${i + 1}`, riferimento: null, tipo: 'confermato', linea: linee.length - 1, posti: b.postiBus ?? 0, interruttore: null, ...costo, preventivi: 0 });
        esito.push(esitoRighe(partiteTragitto.filter((r) => r.busId === b.id), promoterPerBus.get(b.id) ?? 0));
      });
    }
    const busIds = new Set(bus.map((b) => b.chiave));
    if (!righe.some((r) => r.busId && busIds.has(r.busId)) && partiteTragitto.length > 0) {
      linee.push({ chiave: 'senza-smistamento', nome: 'Senza smistamento', fermate: [] });
      bus.push({ chiave: `${t.id}:senza-bus`, nome: 'Passeggeri senza bus', riferimento: null, tipo: 'senza-bus', linea: linee.length - 1, posti: 0, interruttore: null, costo: 0, fonteCosto: null, preventivi: 0 });
      esito.push(esitoRighe(partiteTragitto, commissioniPer(partiteTragitto, () => 'tutti', dati.ctx, { quoteWhiteLabel: false }).get('tutti') ?? 0));
    }
    if (righe.length === 0 && bus.length === 0) continue;
    delEvento.push({
      id: t.id,
      nome: t.nome,
      passeggeri: sommaPasseggeri(righe),
      inAttesaDiRimborso: sommaPasseggeri(righe.filter((r) => rimborsiInAttesa.has(r.id))),
      incasso: sommaPagati(partiteTragitto),
      daIncassare: sommaDaIncassare(partiteTragitto),
      linee,
      bus,
      esiti: [esito],
    });
  }
  return risultato;
}

// ---------------------------------------------------------------- Linee

export interface LineaCalcolata {
  id: string;
  nome: string;
  eventoId: string;
  tragittoId: string;
  tragittoNome: string;
  tragittoAttivo: boolean;
  daConfermare: boolean;
  fermate: string[];
  busIds: string[];
  posti: number;
  passeggeri: number;
  postiPareggio: number | null;
  /** Previsto (un acconto conta per intero). */
  incasso: number;
  /** Pagato davvero. */
  incassato: number;
  costo: number | null;
  costoCompleto: boolean;
  margine: number | null;
  /** incassato − costo − commissioni; null senza bus. */
  margineAOggi: number | null;
}

/** Una riga per linea, con la stessa regola dei posti di
 *  linee-da-confermare.service.ts: una linea con bus vale i posti dei suoi bus
 *  (anche se era da confermare), una linea senza bus i posti del preventivo.
 *  Una linea con bus conta i passeggeri e l'incasso delle fermate che copre
 *  (come il riepilogo economico di Partenze) e il pareggio è la soglia di
 *  Impostazioni sui suoi posti. Una linea da confermare copre tutte le
 *  fermate: prende i passeggeri che non stanno nelle altre linee del
 *  tragitto, una dopo l'altra, con la parte di incasso in proporzione; senza
 *  bus non c'è un costo, quindi niente pareggio né margine. */
export function lineeEventi(dati: DatiEventi): LineaCalcolata[] {
  const tragittoPerId = new Map(dati.strutture.tragitti.map((t) => [t.id, t]));
  const righePerTragitto = raggruppa(dati.righe, (r) => r.tragittoId);
  const cittaPerLinea = raggruppa(dati.strutture.fermateLinee, (f) => f.lineaId);
  const busPerLinea = raggruppa(dati.strutture.bus.filter((b) => b.lineaId !== null), (b) => b.lineaId!);

  const calcolate = dati.strutture.linee.flatMap((l): LineaCalcolata[] => {
    const t = tragittoPerId.get(l.tragittoId);
    if (!t) return [];
    const citta = (cittaPerLinea.get(l.id) ?? []).map((f) => f.citta);
    const bus = busPerLinea.get(l.id) ?? [];
    const conBus = bus.length > 0;
    const daConfermare = l.daConfermare && !conBus;
    const posti = conBus ? bus.reduce((s, b) => s + (b.postiBus ?? 0), 0) : (t.preventivoPostiBus ?? dati.postiPerBus);
    const coperte = new Set(citta);
    const righe = daConfermare ? [] : (righePerTragitto.get(l.tragittoId) ?? []).filter((r) => coperte.has(r.fermataCitta));
    const incasso = sommaTotali(righe);
    const incassato = sommaPagati(righe);
    const costo = conBus ? arrotondaEuro(bus.reduce((s, b) => s + Number(b.costo ?? 0), 0)) : null;
    const commissioni = costo === null ? 0 : commissioniPer(righe, () => l.id, dati.ctx).get(l.id) ?? 0;
    return [{
      id: l.id,
      nome: l.nome,
      eventoId: t.eventoId,
      tragittoId: t.id,
      tragittoNome: t.nome,
      tragittoAttivo: t.attivo,
      daConfermare,
      fermate: citta,
      busIds: bus.map((b) => b.id),
      posti,
      passeggeri: sommaPasseggeri(righe),
      postiPareggio: conBus && posti > 0 ? Math.round(posti * (dati.soglia / 100)) : null,
      incasso,
      incassato,
      costo,
      costoCompleto: conBus && bus.every((b) => b.costo !== null),
      margine: costo === null ? null : arrotondaEuro(incasso - costo - commissioni),
      margineAOggi: costo === null ? null : arrotondaEuro(incassato - costo - commissioni),
    }];
  });

  for (const [tragittoId, lineeTragitto] of raggruppa(calcolate, (l) => l.tragittoId)) {
    const inAttesa = lineeTragitto.filter((l) => l.daConfermare);
    if (inAttesa.length === 0) continue;
    const righe = righePerTragitto.get(tragittoId) ?? [];
    const passeggeri = sommaPasseggeri(righe);
    const incasso = righe.reduce((s, r) => s + r.totale, 0);
    const incassato = righe.reduce((s, r) => s + r.pagato, 0);
    let senzaPosto = passeggeri - lineeTragitto.filter((l) => !l.daConfermare).reduce((s, l) => s + l.posti, 0);
    for (const l of inAttesa) {
      const presi = Math.max(0, Math.min(senzaPosto, l.posti));
      l.passeggeri = presi;
      l.incasso = passeggeri > 0 ? arrotondaEuro((incasso * presi) / passeggeri) : 0;
      l.incassato = passeggeri > 0 ? arrotondaEuro((incassato * presi) / passeggeri) : 0;
      senzaPosto -= presi;
    }
  }
  return calcolate;
}

export const sottoPareggio = (l: LineaCalcolata) => l.postiPareggio !== null && l.passeggeri < l.postiPareggio;
