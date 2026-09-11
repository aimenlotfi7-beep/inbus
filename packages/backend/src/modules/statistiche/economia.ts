import { calcolaCommissioneRighe } from '../../shared/commissioneRighe.js';
import { arrotondaEuro, raggruppa, type CampagnaFonte } from './calcoli.js';

/** I conti economici delle statistiche che non leggono il database (i dati
 *  li prepara statistiche.service.ts): commissioni, economia per evento,
 *  linee. Si provano da soli in economia.test.ts. */

export interface PrenotazioneStatistica {
  id: string;
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
}

export interface StruttureEventi {
  tragitti: { id: string; eventoId: string; nome: string; attivo: boolean; preventivoPostiBus: number | null }[];
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
}

export const sommaPasseggeri = (righe: { passeggeri: number }[]) => righe.reduce((s, r) => s + r.passeggeri, 0);
export const sommaTotali = (righe: { totale: number | string }[]) => arrotondaEuro(righe.reduce((s, r) => s + Number(r.totale), 0));

// ---------------------------------------------------------------- Commissioni

/** Commissioni per gruppo (evento, fonte, linea…). Per i promoter la stessa
 *  regola del report Campagne: riga per riga con il compenso del coupon se ce
 *  l'ha (calcolaCommissioneRighe), arrotondata per promoter; un codice
 *  promoter che non esiste più non matura commissione. Con quoteWhiteLabel
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
  const perPromoter = new Map<string, { gruppo: string; percentuale: number; righe: { totale: number; passeggeri: number; couponCodice: string | null }[] }>();
  for (const r of righe) {
    const g = gruppo(r);
    if (conQuote && r.quotaWhiteLabel) risultato.set(g, (risultato.get(g) ?? 0) + Number(r.quotaWhiteLabel));
    if (!r.promoterCodice) continue;
    const percentuale = ctx.percentualiPromoter.get(r.promoterCodice);
    if (percentuale === undefined) continue;
    const chiave = `${g} ${r.promoterCodice}`;
    const voce = perPromoter.get(chiave) ?? { gruppo: g, percentuale, righe: [] };
    voce.righe.push({ totale: r.totale, passeggeri: r.passeggeri, couponCodice: r.couponCodice });
    perPromoter.set(chiave, voce);
  }
  for (const v of perPromoter.values()) {
    risultato.set(v.gruppo, (risultato.get(v.gruppo) ?? 0) + calcolaCommissioneRighe(v.righe, ctx.coupon, v.percentuale));
  }
  for (const [g, n] of risultato) risultato.set(g, arrotondaEuro(n));
  return risultato;
}

// ---------------------------------------------------------------- Economia per evento

export interface EconomiaEvento {
  passeggeri: number;
  prenotazioni: number;
  incasso: number;
  bus: number;
  busSenzaCosto: number;
  costoBus: number;
  commissioni: number;
  /** incasso − costo dei bus − commissioni (promoter e quote White Label). */
  margine: number;
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
    passeggeri: 0, prenotazioni: 0, incasso: 0, bus: 0, busSenzaCosto: 0, costoBus: 0, commissioni: 0, margine: 0,
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
    if ((postiPerTragitto.get(r.tragittoId) ?? 0) > 0) e.passeggeriConBus += r.passeggeri;
    if (!busPerTragitto.has(r.tragittoId)) e.passeggeriSenzaBus += r.passeggeri;
  }
  const commissioni = commissioniPer(dati.righe, (r) => r.eventoId, dati.ctx);
  for (const [id, e] of risultato) {
    e.incasso = arrotondaEuro(e.incasso);
    e.costoBus = arrotondaEuro(e.costoBus);
    e.commissioni = commissioni.get(id) ?? 0;
    e.margine = arrotondaEuro(e.incasso - e.costoBus - e.commissioni);
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
  incasso: number;
  costo: number | null;
  costoCompleto: boolean;
  margine: number | null;
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
      costo,
      costoCompleto: conBus && bus.every((b) => b.costo !== null),
      margine: costo === null ? null : arrotondaEuro(incasso - costo - commissioni),
    }];
  });

  for (const [tragittoId, lineeTragitto] of raggruppa(calcolate, (l) => l.tragittoId)) {
    const inAttesa = lineeTragitto.filter((l) => l.daConfermare);
    if (inAttesa.length === 0) continue;
    const righe = righePerTragitto.get(tragittoId) ?? [];
    const passeggeri = sommaPasseggeri(righe);
    const incasso = righe.reduce((s, r) => s + r.totale, 0);
    let senzaPosto = passeggeri - lineeTragitto.filter((l) => !l.daConfermare).reduce((s, l) => s + l.posti, 0);
    for (const l of inAttesa) {
      const presi = Math.max(0, Math.min(senzaPosto, l.posti));
      l.passeggeri = presi;
      l.incasso = passeggeri > 0 ? arrotondaEuro((incasso * presi) / passeggeri) : 0;
      senzaPosto -= presi;
    }
  }
  return calcolate;
}

export const sottoPareggio = (l: LineaCalcolata) => l.postiPareggio !== null && l.passeggeri < l.postiPareggio;
