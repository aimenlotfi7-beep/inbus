import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  busFisici, campagne, coupon, eventi, fermate, fornitori, lineaFermate, linee, listaAttesa, offerteEvento, organizzatori,
  partecipantiPrenotazione, preventiviRichieste, preventiviRisposte, prenotazioni, promoter, richiesteRimborso, tragitti, utenti,
  whiteLabel,
} from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { giornoARoma } from '../../shared/formato.js';
import { applicaScontoOfferta, prezzoNormaleFermata } from '../../shared/prezzi.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import { cambiPercorso, type StatoCambioPercorso } from '../preventivi/cambio-percorso.js';
import { preventiviService } from '../preventivi/preventivi.routes.js';
import {
  FASCE_ANTICIPO, FASCE_ETA, MESI_COORTI, MINIMO_PERSONE_FASCE, NOMI_TIPO_FONTE, aBlocchi, arrotondaEuro, calcolaCoorti,
  curvaCumulativa, etaAl, fasciaAnticipo, fasciaEta, fonteDi, mediaCurve, mediana, percentuale, raggruppa, type Fonte, type TipoFonte,
} from './calcoli.js';
import {
  commissioniPer, costiMancanti, costoCompleto, economiaEventi, lineeEventi, sommaPasseggeri, sommaTotali, sottoPareggio,
  type ContestoFonti, type DatiEventi, type EconomiaEvento, type PrenotazioneStatistica, type StruttureEventi,
} from './economia.js';
import { giorniTra, indiceIntervallo, inizioGiornoRoma, oggiRoma, periodoPerRisposta, type Intervallo, type Periodo } from './periodo.js';

/** Statistiche del gestionale: legge i dati e li passa ai conti puri di
 *  calcoli.ts ed economia.ts. Contano solo le prenotazioni CONFERMATE di
 *  eventi non in bozza e non nel cestino. "Per data d'acquisto" = quando è
 *  stata fatta la prenotazione (vendite, canali, clienti); "per data
 *  dell'evento" = quando c'è l'evento (margini, riempimento). I tipi della
 *  risposta sono in packages/frontend/src/api/statistiche.ts. */

/** "Linea sotto il pareggio" in Da guardare adesso solo a ridosso della partenza. */
const GIORNI_AVVISO_PAREGGIO = 14;
/** Linea da confermare in rosso quando manca meno di una settimana. */
const GIORNI_LINEA_URGENTE = 7;
const MAX_EVENTI_SIMILI = 8;
const MAX_GIORNI_RITMO = 365;
const MIN_GIORNI_RITMO = 30;
const TOP_FERMATE = 10;
/** Id per query: Postgres accetta al massimo ~65.000 parametri. */
const BLOCCO_ID = 5000;

const eventoValido = and(isNull(eventi.eliminatoIl), eq(eventi.bozza, false));

function plurale(n: number, singolare: string, formaPlurale: string): string {
  return `${n} ${n === 1 ? singolare : formaPlurale}`;
}

async function aBlocchiDaDb<T>(ids: string[], leggi: (blocco: string[]) => Promise<T[]>): Promise<T[]> {
  if (ids.length === 0) return [];
  return (await Promise.all(aBlocchi(ids, BLOCCO_ID).map(leggi))).flat();
}

// ---------------------------------------------------------------- Prenotazioni

async function leggiPrenotazioni(condizione: SQL | undefined): Promise<PrenotazioneStatistica[]> {
  const righe = await db.select({
    id: prenotazioni.id,
    eventoId: prenotazioni.eventoId,
    tragittoId: prenotazioni.tragittoId,
    fermataCitta: prenotazioni.fermataCitta,
    busId: prenotazioni.busId,
    utenteId: prenotazioni.utenteId,
    passeggeri: prenotazioni.passeggeri,
    totale: prenotazioni.totale,
    sconto: prenotazioni.sconto,
    scontoBundle: prenotazioni.scontoBundle,
    couponCodice: prenotazioni.couponCodice,
    promoterCodice: prenotazioni.promoterCodice,
    canaleVendita: prenotazioni.canaleVendita,
    whiteLabelId: prenotazioni.whiteLabelId,
    quotaWhiteLabel: prenotazioni.commissioneImportoSnapshot,
    utmSource: prenotazioni.utmSource,
    utmMedium: prenotazioni.utmMedium,
    utmCampaign: prenotazioni.utmCampaign,
    offertaId: prenotazioni.offertaId,
    tipoPagamento: prenotazioni.tipoPagamento,
    saldoPagato: prenotazioni.saldoPagato,
    scadenzaSaldo: prenotazioni.scadenzaSaldo,
    creataIl: prenotazioni.creataIl,
    eventoData: eventi.data,
  }).from(prenotazioni)
    .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
    .where(and(eq(prenotazioni.stato, 'CONFERMATA'), eventoValido, condizione));
  const previsti = await totaliPrevisti(righe.filter((r) => r.tipoPagamento === 'ACCONTO' && !r.saldoPagato));
  return righe.map((r) => ({ ...r, totale: previsti.get(r.id) ?? Number(r.totale), pagato: Number(r.totale) }));
}

/** Un acconto non ancora saldato ha in `totale` solo l'acconto; quando il
 *  cliente salda, `totale` diventa il prezzo intero (saldaResto in
 *  prenotazioni.service.ts). Nelle statistiche conta subito il prezzo intero,
 *  calcolato come al saldo (prezzo attuale della fermata, offerta, sconto): i
 *  numeri di un periodo non cambiano quando arriva il saldo, e il confronto
 *  con un periodo già tutto saldato non penalizza quello in corso. */
async function totaliPrevisti(righe: { id: string; tragittoId: string; fermataCitta: string; passeggeri: number; totale: string; sconto: string; offertaId: string | null }[]) {
  const previsti = new Map<string, number>();
  if (righe.length === 0) return previsti;
  const tragittiIds = [...new Set(righe.map((r) => r.tragittoId))];
  const offerteIds = [...new Set(righe.map((r) => r.offertaId).filter((id): id is string => id !== null))];
  const [righeFermate, righeTragitti, righeOfferte] = await Promise.all([
    aBlocchiDaDb(tragittiIds, (ids) => db.select({ tragittoId: fermate.tragittoId, citta: fermate.citta, prezzo: fermate.prezzo })
      .from(fermate).where(inArray(fermate.tragittoId, ids)).orderBy(asc(fermate.ordine))),
    aBlocchiDaDb(tragittiIds, (ids) => db.select({ id: tragitti.id, prezzoExtra: tragitti.prezzoExtra, prezzoEvento: eventi.prezzo })
      .from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId)).where(inArray(tragitti.id, ids))),
    aBlocchiDaDb(offerteIds, (ids) => db.select({ id: offerteEvento.id, scontoPercentuale: offerteEvento.scontoPercentuale })
      .from(offerteEvento).where(inArray(offerteEvento.id, ids))),
  ]);
  const fermataPer = new Map<string, { prezzo: string | null }>();
  for (const f of righeFermate) {
    const chiave = `${f.tragittoId} ${f.citta}`;
    if (!fermataPer.has(chiave)) fermataPer.set(chiave, f);
  }
  const tragittoPer = new Map(righeTragitti.map((t) => [t.id, t]));
  const offertaPer = new Map(righeOfferte.map((o) => [o.id, o]));
  for (const r of righe) {
    const t = tragittoPer.get(r.tragittoId);
    const prezzo = applicaScontoOfferta(
      prezzoNormaleFermata(fermataPer.get(`${r.tragittoId} ${r.fermataCitta}`), t ? { prezzo: t.prezzoEvento } : undefined, t),
      r.offertaId ? offertaPer.get(r.offertaId) : undefined,
    );
    // Mai meno dell'acconto: se il prezzo della fermata non c'è più resta quello.
    previsti.set(r.id, arrotondaEuro(Math.max(Number(r.totale), prezzo * r.passeggeri - Number(r.sconto))));
  }
  return previsti;
}

const fatteTra = (inizio: Date, fine: Date) => and(gte(prenotazioni.creataIl, inizio), lt(prenotazioni.creataIl, fine));

function perIntervallo<T>(righe: T[], istante: (r: T) => Date | null, valore: (r: T) => number, intervalli: Intervallo[]): number[] {
  const valori = intervalli.map(() => 0);
  for (const r of righe) {
    const quando = istante(r);
    const i = quando ? indiceIntervallo(quando, intervalli) : -1;
    if (i >= 0) valori[i] += valore(r);
  }
  return valori;
}

// ---------------------------------------------------------------- Eventi

const colonneEvento = {
  id: eventi.id,
  artista: eventi.artista,
  genere: eventi.genere,
  citta: eventi.citta,
  luogo: eventi.luogo,
  data: eventi.data,
  venditeFermate: eventi.venditeFermate,
};
type RigaEvento = { id: string; artista: string; genere: string; citta: string; luogo: string; data: Date; venditeFermate: boolean };

async function eventiTra(inizio: Date, fine: Date): Promise<RigaEvento[]> {
  if (inizio >= fine) return [];
  return db.select(colonneEvento).from(eventi)
    .where(and(eventoValido, gte(eventi.data, inizio), lt(eventi.data, fine)))
    .orderBy(desc(eventi.data));
}

// ---------------------------------------------------------------- Fonti

async function leggiContestoFonti(righe: PrenotazioneStatistica[]): Promise<ContestoFonti> {
  const codiciCoupon = [...new Set(righe.map((r) => r.couponCodice).filter((c): c is string => !!c))];
  const [tutteCampagne, tuttiPromoter, righeWhiteLabel, righeCoupon] = await Promise.all([
    db.select({ id: campagne.id, nome: campagne.nome, utmSource: campagne.utmSource, utmMedium: campagne.utmMedium, utmCampaign: campagne.utmCampaign }).from(campagne),
    db.select({ id: promoter.id, nome: promoter.nome, codice: promoter.codice, commissionePercentuale: promoter.commissionePercentuale }).from(promoter),
    db.select({ id: whiteLabel.id, nome: organizzatori.nome }).from(whiteLabel).innerJoin(organizzatori, eq(organizzatori.id, whiteLabel.organizzatoreId)),
    aBlocchiDaDb(codiciCoupon, (codici) => db.select({
      codice: coupon.codice, compensoTipo: coupon.compensoTipo, compensoValore: coupon.compensoValore, compensoFissoPer: coupon.compensoFissoPer, promoterId: coupon.promoterId,
    }).from(coupon).where(inArray(coupon.codice, codici))),
  ]);
  return {
    campagne: tutteCampagne,
    nomiPromoter: new Map(tuttiPromoter.map((p) => [p.codice, p.nome])),
    idPromoter: new Map(tuttiPromoter.map((p) => [p.codice, p.id])),
    nomiPromoterPerId: new Map(tuttiPromoter.map((p) => [p.id, p.nome])),
    percentualiPromoter: new Map(tuttiPromoter.map((p) => [p.codice, Number(p.commissionePercentuale)])),
    nomiWhiteLabel: new Map(righeWhiteLabel.map((w) => [w.id, w.nome])),
    coupon: new Map(righeCoupon.map((c) => [c.codice, c])),
  };
}

const fonteDellaRiga = (r: PrenotazioneStatistica, ctx: ContestoFonti): Fonte => fonteDi(r, ctx.campagne, ctx.nomiPromoter, ctx.nomiWhiteLabel);

function sintesiPerTipo(righe: PrenotazioneStatistica[], ctx: ContestoFonti) {
  const perTipo = new Map<TipoFonte, { tipo: TipoFonte; nome: string; prenotazioni: number; passeggeri: number; incasso: number }>();
  for (const r of righe) {
    const { tipo } = fonteDellaRiga(r, ctx);
    const voce = perTipo.get(tipo) ?? { tipo, nome: NOMI_TIPO_FONTE[tipo], prenotazioni: 0, passeggeri: 0, incasso: 0 };
    voce.prenotazioni += 1;
    voce.passeggeri += r.passeggeri;
    voce.incasso += r.totale;
    perTipo.set(tipo, voce);
  }
  return [...perTipo.values()].map((v) => ({ ...v, incasso: arrotondaEuro(v.incasso) })).sort((a, b) => b.incasso - a.incasso);
}

// ---------------------------------------------------------------- Tragitti, linee e bus

async function leggiStrutture(eventoIds: string[]): Promise<StruttureEventi> {
  const righeTragitti = await aBlocchiDaDb(eventoIds, (ids) => db.select({
    id: tragitti.id, eventoId: tragitti.eventoId, nome: tragitti.nome, attivo: tragitti.attivo, preventivoPostiBus: tragitti.preventivoPostiBus,
  }).from(tragitti).where(and(inArray(tragitti.eventoId, ids), isNull(tragitti.eliminatoIl))).orderBy(asc(tragitti.nome)));
  const righeLinee = await aBlocchiDaDb(righeTragitti.map((t) => t.id), (ids) => db.select({
    id: linee.id, nome: linee.nome, tragittoId: linee.tragittoId, daConfermare: linee.daConfermare,
  }).from(linee).where(inArray(linee.tragittoId, ids)).orderBy(asc(linee.ordine), asc(linee.creatoIl)));
  const lineeIds = righeLinee.map((l) => l.id);
  const [fermateLinee, bus] = await Promise.all([
    aBlocchiDaDb(lineeIds, (ids) => db.select({ lineaId: lineaFermate.lineaId, citta: fermate.citta }).from(lineaFermate)
      .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
      .where(inArray(lineaFermate.lineaId, ids)).orderBy(asc(lineaFermate.ordine))),
    aBlocchiDaDb(lineeIds, (ids) => db.select({ id: busFisici.id, lineaId: busFisici.lineaId, costo: busFisici.costo, postiBus: busFisici.postiBus })
      .from(busFisici).where(inArray(busFisici.lineaId, ids))),
  ]);
  return { tragitti: righeTragitti, linee: righeLinee, fermateLinee, bus };
}

async function caricaDatiEventi(eventoIds: string[]): Promise<DatiEventi> {
  const [righe, strutture, soglia, postiPerBus] = await Promise.all([
    aBlocchiDaDb(eventoIds, (ids) => leggiPrenotazioni(inArray(prenotazioni.eventoId, ids))),
    leggiStrutture(eventoIds),
    leggiSogliaOccupazionePareggio(),
    leggiPostiPerBus(),
  ]);
  return { righe, strutture, ctx: await leggiContestoFonti(righe), soglia, postiPerBus };
}

async function contaListaAttesa(eventoIds: string[]) {
  return aBlocchiDaDb(eventoIds, (ids) => db.select({ eventoId: listaAttesa.eventoId, tragittoId: listaAttesa.tragittoId, fermataId: listaAttesa.fermataId })
    .from(listaAttesa)
    .where(and(inArray(listaAttesa.eventoId, ids), eq(listaAttesa.stato, 'IN_ATTESA'), eq(listaAttesa.completata, false))));
}

// ---------------------------------------------------------------- Da guardare adesso

const TESTO_CAMBIO: Record<StatoCambioPercorso, string> = {
  da_richiedere: 'preventivo da rifare',
  in_attesa: 'nuovo preventivo chiesto, in attesa di risposte',
  da_valutare: 'risposte dei fornitori da valutare',
};

type GravitaAvviso = 'urgente' | 'critico' | 'attenzione';
const ORDINE_GRAVITA: Record<GravitaAvviso, number> = { urgente: 0, critico: 1, attenzione: 2 };

/** Voci del menu del gestionale a cui porta un avviso. */
type SezioneAvviso = 'partenze-preventivi' | 'partenze-confermato' | 'partenze-da-confermare' | 'pagamenti' | 'rimborsi';

interface Avviso {
  tipo: 'percorso_cambiato' | 'linea_sotto_pareggio' | 'posti_mancanti' | 'linea_da_confermare' | 'saldo_scaduto' | 'rimborso_in_attesa' | 'preventivo_da_valutare';
  gravita: GravitaAvviso;
  titolo: string;
  dettaglio: string;
  sezione: SezioneAvviso;
  eventoId: string | null;
  data: string | null;
}

function quando(giorni: number): string {
  if (giorni === 0) return 'oggi';
  if (giorni === 1) return 'domani';
  return `tra ${giorni} giorni`;
}

// ---------------------------------------------------------------- Servizio

export const statisticheService = {
  async panoramica(p: Periodo) {
    const [righe, righeConfronto, eventiPeriodo, eventiConfronto] = await Promise.all([
      leggiPrenotazioni(fatteTra(p.inizio, p.fine)),
      p.confronto ? leggiPrenotazioni(fatteTra(p.confronto.inizio, p.confronto.fine)) : Promise.resolve(null),
      eventiTra(p.inizio, p.fine),
      p.confronto ? eventiTra(p.confronto.inizio, p.confronto.fine) : Promise.resolve(null),
    ]);
    const idsPeriodo = eventiPeriodo.map((e) => e.id);
    const idsConfronto = eventiConfronto?.map((e) => e.id) ?? null;
    const [ctx, datiPeriodo, datiConfronto] = await Promise.all([
      leggiContestoFonti(righe),
      caricaDatiEventi(idsPeriodo),
      idsConfronto ? caricaDatiEventi(idsConfronto) : Promise.resolve(null),
    ]);

    const vendite = (rr: PrenotazioneStatistica[]) => {
      const passeggeri = sommaPasseggeri(rr);
      const incasso = sommaTotali(rr);
      return { passeggeri, prenotazioni: rr.length, incasso, ricavo: passeggeri > 0 ? arrotondaEuro(incasso / passeggeri) : 0 };
    };
    const va = vendite(righe);
    const vc = righeConfronto ? vendite(righeConfronto) : null;
    const andamento = perIntervallo(righe, (r) => r.creataIl, (r) => r.passeggeri, p.intervalli);
    const andamentoConfronto = righeConfronto && p.confronto
      ? perIntervallo(righeConfronto, (r) => r.creataIl, (r) => r.passeggeri, p.confronto.intervalli)
      : null;

    const sintesiEventi = (ids: string[], dati: DatiEventi) => {
      const economia = [...economiaEventi(ids, dati).values()];
      const somma = (f: (e: EconomiaEvento) => number) => economia.reduce((s, e) => s + f(e), 0);
      const posti = somma((e) => e.postiSuiBus);
      return {
        eventi: ids.length,
        passeggeri: somma((e) => e.passeggeri),
        incasso: arrotondaEuro(somma((e) => e.incasso)),
        costoBus: arrotondaEuro(somma((e) => e.costoBus)),
        commissioni: arrotondaEuro(somma((e) => e.commissioni)),
        margine: arrotondaEuro(somma((e) => e.margine)),
        riempimento: posti > 0 ? percentuale(somma((e) => e.passeggeriConBus), posti) : null,
        costiMancanti: economia.filter(costiMancanti).length,
      };
    };
    const ea = sintesiEventi(idsPeriodo, datiPeriodo);
    const ec = idsConfronto && datiConfronto ? sintesiEventi(idsConfronto, datiConfronto) : null;

    return {
      periodo: periodoPerRisposta(p),
      vendite: {
        passeggeri: { attuale: va.passeggeri, precedente: vc?.passeggeri ?? null },
        prenotazioni: { attuale: va.prenotazioni, precedente: vc?.prenotazioni ?? null },
        incasso: { attuale: va.incasso, precedente: vc?.incasso ?? null },
        ricavoPerPasseggero: { attuale: va.ricavo, precedente: vc?.ricavo ?? null },
        andamento: andamento.map((attuale, i) => ({ attuale, precedente: andamentoConfronto ? andamentoConfronto[i] ?? null : null })),
      },
      eventiDelPeriodo: {
        eventi: { attuale: ea.eventi, precedente: ec?.eventi ?? null },
        passeggeri: { attuale: ea.passeggeri, precedente: ec?.passeggeri ?? null },
        incasso: { attuale: ea.incasso, precedente: ec?.incasso ?? null },
        costoBus: { attuale: ea.costoBus, precedente: ec?.costoBus ?? null },
        commissioni: { attuale: ea.commissioni, precedente: ec?.commissioni ?? null },
        margine: { attuale: ea.margine, precedente: ec?.margine ?? null },
        riempimentoBus: { attuale: ea.riempimento, precedente: ec?.riempimento ?? null },
        eventiConCostiMancanti: ea.costiMancanti,
      },
      perFonte: sintesiPerTipo(righe, ctx),
    };
  },

  /** Le cose da fare adesso, dalla più urgente. Non dipende dal periodo. */
  async daGuardare(): Promise<Avviso[]> {
    const adesso = new Date();
    const oggi = oggiRoma(adesso);
    const eventiFuturi = await db.select(colonneEvento).from(eventi)
      .where(and(eventoValido, gte(eventi.data, inizioGiornoRoma(oggi))));
    const perId = new Map(eventiFuturi.map((e) => [e.id, e]));
    const giorniA = (eventoId: string) => giorniTra(oggi, giornoARoma(perId.get(eventoId)!.data));
    const avviso = (a: Omit<Avviso, 'data'>): Avviso => ({ ...a, data: a.eventoId ? perId.get(a.eventoId)!.data.toISOString() : null });
    const avvisi: Avviso[] = [];

    if (eventiFuturi.length) {
      const dati = await caricaDatiEventi(eventiFuturi.map((e) => e.id));
      // Solo i tragitti in vendita: uno disattivato non si prepara più.
      const tragittiAttivi = dati.strutture.tragitti.filter((t) => t.attivo);

      // Stessi tragitti del pallino viola di Preventivi (contaCambiPercorso).
      const perCambio = tragittiAttivi.filter((t) => perId.get(t.eventoId)!.data >= adesso);
      const cambi = await cambiPercorso(perCambio.map((t) => t.id));
      for (const t of perCambio) {
        const cambio = cambi.get(t.id);
        if (!cambio) continue;
        avvisi.push(avviso({
          tipo: 'percorso_cambiato', gravita: 'urgente', sezione: 'partenze-preventivi', eventoId: t.eventoId,
          titolo: `Percorso cambiato: ${perId.get(t.eventoId)!.artista}`,
          dettaglio: `${t.nome} · ${TESTO_CAMBIO[cambio.stato]} · ${quando(giorniA(t.eventoId))}`,
        }));
      }

      const lineeAttive = lineeEventi(dati).filter((l) => l.tragittoAttivo);
      for (const l of lineeAttive) {
        const giorni = giorniA(l.eventoId);
        const artista = perId.get(l.eventoId)!.artista;
        if (l.daConfermare) {
          avvisi.push(avviso({
            tipo: 'linea_da_confermare', gravita: giorni <= GIORNI_LINEA_URGENTE ? 'critico' : 'attenzione', sezione: 'partenze-da-confermare', eventoId: l.eventoId,
            titolo: `Linea da confermare: ${artista}`,
            dettaglio: `${l.nome} (${l.tragittoNome}) · ${plurale(l.passeggeri, 'passeggero', 'passeggeri')} senza posto · ${quando(giorni)}`,
          }));
        } else if (sottoPareggio(l) && giorni <= GIORNI_AVVISO_PAREGGIO) {
          avvisi.push(avviso({
            tipo: 'linea_sotto_pareggio', gravita: 'critico', sezione: 'partenze-confermato', eventoId: l.eventoId,
            titolo: `Linea sotto il pareggio: ${artista}`,
            dettaglio: `${l.nome} (${l.tragittoNome}) · ${plurale(l.passeggeri, 'passeggero', 'passeggeri')}, pareggio a ${l.postiPareggio} · ${quando(giorni)}`,
          }));
        }
      }

      // Più passeggeri che posti sui bus senza una linea da confermare che li
      // accolga: di solito dura un attimo (le linee si allineano da sole), se
      // resta c'è da intervenire.
      const righePerTragitto = raggruppa(dati.righe, (r) => r.tragittoId);
      const nomeTragitto = new Map(tragittiAttivi.map((t) => [t.id, t.nome]));
      for (const [tragittoId, lineeTragitto] of raggruppa(lineeAttive, (l) => l.tragittoId)) {
        if (lineeTragitto.some((l) => l.daConfermare)) continue;
        const posti = lineeTragitto.filter((l) => l.busIds.length > 0).reduce((s, l) => s + l.posti, 0);
        const passeggeri = sommaPasseggeri(righePerTragitto.get(tragittoId) ?? []);
        if (posti === 0 || passeggeri <= posti) continue;
        const eventoId = lineeTragitto[0].eventoId;
        avvisi.push(avviso({
          tipo: 'posti_mancanti', gravita: 'critico', sezione: 'partenze-da-confermare', eventoId,
          titolo: `Mancano posti sui bus: ${perId.get(eventoId)!.artista}`,
          dettaglio: `${nomeTragitto.get(tragittoId) ?? ''} · ${passeggeri} passeggeri su ${posti} posti · ${quando(giorniA(eventoId))}`,
        }));
      }

      const scaduti = new Map<string, number>();
      for (const r of dati.righe) {
        if (r.tipoPagamento === 'ACCONTO' && !r.saldoPagato && r.scadenzaSaldo && r.scadenzaSaldo < adesso) {
          scaduti.set(r.eventoId, (scaduti.get(r.eventoId) ?? 0) + 1);
        }
      }
      for (const [eventoId, n] of scaduti) {
        avvisi.push(avviso({
          tipo: 'saldo_scaduto', gravita: 'attenzione', sezione: 'pagamenti', eventoId,
          titolo: `Saldi scaduti: ${perId.get(eventoId)!.artista}`,
          dettaglio: `${plurale(n, 'prenotazione ad acconto', 'prenotazioni ad acconto')} con la scadenza del saldo passata · ${quando(giorniA(eventoId))}`,
        }));
      }
    }

    const [rimborsiInAttesa, preventiviDaValutare] = await Promise.all([
      db.select({ origine: richiesteRimborso.origine }).from(richiesteRimborso).where(eq(richiesteRimborso.stato, 'IN_ATTESA')),
      preventiviService.contaDaValutare(),
    ]);
    if (rimborsiInAttesa.length) {
      const daVariazione = rimborsiInAttesa.filter((r) => r.origine === 'VARIAZIONE').length;
      avvisi.push(avviso({
        tipo: 'rimborso_in_attesa', gravita: 'attenzione', sezione: 'rimborsi', eventoId: null,
        titolo: `${plurale(rimborsiInAttesa.length, 'richiesta di rimborso', 'richieste di rimborso')} da gestire`,
        dettaglio: daVariazione ? `${daVariazione} per una variazione decisa da noi` : 'Da approvare o rifiutare',
      }));
    }
    if (preventiviDaValutare > 0) {
      avvisi.push(avviso({
        tipo: 'preventivo_da_valutare', gravita: 'attenzione', sezione: 'partenze-preventivi', eventoId: null,
        titolo: `${plurale(preventiviDaValutare, 'tragitto', 'tragitti')} con preventivi da valutare`,
        dettaglio: 'I fornitori hanno risposto: manca la scelta',
      }));
    }

    return avvisi.sort((a, b) => ORDINE_GRAVITA[a.gravita] - ORDINE_GRAVITA[b.gravita]
      || (a.data ?? '9999').localeCompare(b.data ?? '9999'));
  },

  async eventi(p: Periodo) {
    const oggi = oggiRoma();
    const inizioOggi = inizioGiornoRoma(oggi);
    const [futuri, passati] = await Promise.all([
      db.select(colonneEvento).from(eventi).where(and(eventoValido, gte(eventi.data, inizioOggi))).orderBy(asc(eventi.data)),
      eventiTra(p.inizio, p.fine < inizioOggi ? p.fine : inizioOggi),
    ]);
    const ids = [...futuri, ...passati].map((e) => e.id);
    const [dati, attese] = await Promise.all([caricaDatiEventi(ids), contaListaAttesa(ids)]);
    const economia = economiaEventi(ids, dati);
    const lineePerEvento = raggruppa(lineeEventi(dati).filter((l) => l.tragittoAttivo), (l) => l.eventoId);
    const eventoDiTragitto = new Map(dati.strutture.tragitti.map((t) => [t.id, t.eventoId]));
    const cambi = await cambiPercorso(dati.strutture.tragitti.filter((t) => t.attivo).map((t) => t.id));
    const cambiPerEvento = raggruppa([...cambi.keys()], (tragittoId) => eventoDiTragitto.get(tragittoId) ?? '');
    const attesePerEvento = raggruppa(attese, (a) => a.eventoId);

    const riga = (e: RigaEvento) => {
      const eco = economia.get(e.id)!;
      const lineeEvento = lineePerEvento.get(e.id) ?? [];
      const haBus = eco.bus > 0;
      return {
        id: e.id,
        artista: e.artista,
        citta: e.citta,
        luogo: e.luogo,
        data: e.data.toISOString(),
        giorniAllaPartenza: giorniTra(oggi, giornoARoma(e.data)),
        passeggeri: eco.passeggeri,
        incasso: eco.incasso,
        postiSuiBus: eco.postiSuiBus,
        riempimento: eco.postiSuiBus > 0 ? percentuale(eco.passeggeriConBus, eco.postiSuiBus) : null,
        lineeSottoPareggio: lineeEvento.filter(sottoPareggio).length,
        lineeDaConfermare: lineeEvento.filter((l) => l.daConfermare).length,
        percorsiCambiati: cambiPerEvento.get(e.id)?.length ?? 0,
        listaAttesa: attesePerEvento.get(e.id)?.length ?? 0,
        costoBus: haBus ? eco.costoBus : null,
        costoCompleto: costoCompleto(eco),
        commissioni: eco.commissioni,
        margine: haBus ? eco.margine : null,
        venditeFermate: e.venditeFermate,
      };
    };
    return { periodo: periodoPerRisposta(p), inVendita: futuri.map(riga), passati: passati.map(riga) };
  },

  async evento(id: string) {
    const [e] = await db.select(colonneEvento).from(eventi).where(and(eq(eventi.id, id), eventoValido)).limit(1);
    if (!e) throw new NonTrovato('Evento');
    const oggi = oggiRoma();
    const giorniOggi = giorniTra(oggi, giornoARoma(e.data));

    const [dati, attese, partecipanti, simili] = await Promise.all([
      caricaDatiEventi([id]),
      contaListaAttesa([id]),
      db.select({ busId: prenotazioni.busId, salitoIl: partecipantiPrenotazione.ticketUtilizzatoIl })
        .from(partecipantiPrenotazione)
        .innerJoin(prenotazioni, eq(prenotazioni.id, partecipantiPrenotazione.prenotazioneId))
        .where(and(eq(prenotazioni.eventoId, id), eq(prenotazioni.stato, 'CONFERMATA'))),
      eventiSimili(e, inizioGiornoRoma(oggi)),
    ]);
    const eco = economiaEventi([id], dati).get(id)!;

    // Ritmo di vendita: stessa scala di giorni per l'evento e per i simili.
    const righeSimili = await aBlocchiDaDb(simili.ids, (ids) => db.select({
      eventoId: prenotazioni.eventoId, passeggeri: prenotazioni.passeggeri, creataIl: prenotazioni.creataIl, eventoData: eventi.data,
    }).from(prenotazioni).innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(and(inArray(prenotazioni.eventoId, ids), eq(prenotazioni.stato, 'CONFERMATA'))));
    const anticipo = (creataIl: Date, dataEvento: Date) => giorniTra(giornoARoma(creataIl), giornoARoma(dataEvento));
    const puntiEvento = dati.righe.map((r) => ({ giorniPrima: anticipo(r.creataIl, r.eventoData), passeggeri: r.passeggeri }));
    const puntiSimili = [...raggruppa(righeSimili, (r) => r.eventoId).values()]
      .map((righe) => righe.map((r) => ({ giorniPrima: anticipo(r.creataIl, r.eventoData), passeggeri: r.passeggeri })));
    let piuLontano = Math.max(MIN_GIORNI_RITMO, giorniOggi);
    for (const punti of [puntiEvento, ...puntiSimili]) for (const pt of punti) piuLontano = Math.max(piuLontano, pt.giorniPrima);
    const maxGiorni = Math.min(MAX_GIORNI_RITMO, piuLontano);
    const giorni = Array.from({ length: maxGiorni + 1 }, (_, i) => maxGiorni - i);
    const curvaEvento = curvaCumulativa(puntiEvento, maxGiorni);
    const curvaSimili = mediaCurve(puntiSimili.map((punti) => curvaCumulativa(punti, maxGiorni)));

    // Linee, con chi è salito tra i passeggeri già assegnati ai loro bus.
    const lineeCalcolate = lineeEventi(dati);
    const lineaDiBus = new Map<string, string>();
    for (const l of lineeCalcolate) for (const busId of l.busIds) lineaDiBus.set(busId, l.id);
    const salitiPerLinea = new Map<string, { assegnati: number; saliti: number }>();
    for (const pt of partecipanti) {
      const lineaId = pt.busId ? lineaDiBus.get(pt.busId) : undefined;
      if (!lineaId) continue;
      const voce = salitiPerLinea.get(lineaId) ?? { assegnati: 0, saliti: 0 };
      voce.assegnati += 1;
      if (pt.salitoIl) voce.saliti += 1;
      salitiPerLinea.set(lineaId, voce);
    }

    return {
      evento: {
        id: e.id, artista: e.artista, genere: e.genere, citta: e.citta, luogo: e.luogo,
        data: e.data.toISOString(), giorniAllaPartenza: giorniOggi, venditeFermate: e.venditeFermate,
      },
      sintesi: {
        passeggeri: eco.passeggeri,
        prenotazioni: eco.prenotazioni,
        incasso: eco.incasso,
        prezzoMedio: eco.passeggeri > 0 ? arrotondaEuro(eco.incasso / eco.passeggeri) : null,
        postiSuiBus: eco.postiSuiBus,
        listaAttesa: attese.length,
        partecipanti: partecipanti.length,
        saliti: partecipanti.filter((pt) => pt.salitoIl).length,
        costoBus: eco.bus > 0 ? eco.costoBus : null,
        commissioni: eco.commissioni,
        margine: eco.bus > 0 ? eco.margine : null,
      },
      ritmo: {
        giorni,
        evento: giorni.map((d, i) => (giorniOggi > 0 && d < giorniOggi ? null : curvaEvento[i])),
        simili: curvaSimili ?? giorni.map(() => null),
        eventiSimili: simili.ids.length,
        criterioSimili: simili.criterio,
        // Un evento oltre l'ultimo giorno del grafico resta sul suo bordo.
        oggi: giorniOggi >= 0 ? Math.min(giorniOggi, maxGiorni) : null,
      },
      sogliaPareggio: dati.soglia,
      linee: lineeCalcolate.map((l) => ({
        id: l.id, nome: l.nome, tragittoNome: l.tragittoNome, daConfermare: l.daConfermare, fermate: l.fermate,
        posti: l.posti, passeggeri: l.passeggeri, postiPareggio: l.postiPareggio,
        assegnati: salitiPerLinea.get(l.id)?.assegnati ?? 0, saliti: salitiPerLinea.get(l.id)?.saliti ?? 0,
        incasso: l.incasso, costo: l.costo, costoCompleto: l.costoCompleto, margine: l.margine,
      })),
      fermate: await fermateEvento(id, dati, attese),
      perFonte: sintesiPerTipo(dati.righe, dati.ctx),
    };
  },

  async vendite(p: Periodo) {
    const righe = await leggiPrenotazioni(fatteTra(p.inizio, p.fine));
    const ctx = await leggiContestoFonti(righe);
    const adesso = new Date();

    const fontePerRiga = new Map(righe.map((r) => [r.id, fonteDellaRiga(r, ctx)]));
    const commissioniFonte = commissioniPer(righe, (r) => fontePerRiga.get(r.id)!.chiave, ctx);
    const fonti = new Map<string, { tipo: TipoFonte; nome: string; prenotazioni: number; passeggeri: number; incasso: number }>();
    for (const r of righe) {
      const f = fontePerRiga.get(r.id)!;
      const voce = fonti.get(f.chiave) ?? { tipo: f.tipo, nome: f.nome, prenotazioni: 0, passeggeri: 0, incasso: 0 };
      voce.prenotazioni += 1;
      voce.passeggeri += r.passeggeri;
      voce.incasso += r.totale;
      fonti.set(f.chiave, voce);
    }

    const righePromoter = righe.filter((r) => r.promoterCodice);
    // Solo quanto spetta ai promoter: senza le quote degli organizzatori White Label.
    const commissioniPromoter = commissioniPer(righePromoter, (r) => r.promoterCodice!, ctx, { quoteWhiteLabel: false });
    const perPromoter = raggruppa(righePromoter, (r) => r.promoterCodice!);
    const perCoupon = raggruppa(righe.filter((r) => r.couponCodice), (r) => r.couponCodice!);
    const perOfferta = raggruppa(righe.filter((r) => r.offertaId), (r) => r.offertaId!);
    const offerte = await aBlocchiDaDb([...perOfferta.keys()], (ids) => db.select({ id: offerteEvento.id, nome: offerteEvento.nome, artista: eventi.artista })
      .from(offerteEvento).innerJoin(eventi, eq(eventi.id, offerteEvento.eventoId))
      .where(inArray(offerteEvento.id, ids)));
    const offertaPerId = new Map(offerte.map((o) => [o.id, o]));

    const anticipo = FASCE_ANTICIPO.map(() => 0);
    for (const r of righe) anticipo[fasciaAnticipo(giorniTra(giornoARoma(r.creataIl), giornoARoma(r.eventoData)))] += r.passeggeri;
    const passeggeriTotali = sommaPasseggeri(righe);

    const acconti = righe.filter((r) => r.tipoPagamento === 'ACCONTO');
    const daSaldare = acconti.filter((r) => !r.saldoPagato);
    const righeBundle = righe.filter((r) => r.scontoBundle !== null);

    return {
      periodo: periodoPerRisposta(p),
      fonti: [...fonti.entries()].map(([chiave, v]) => {
        const incasso = arrotondaEuro(v.incasso);
        const commissione = commissioniFonte.get(chiave) ?? 0;
        return { ...v, incasso, commissione, margineNetto: arrotondaEuro(incasso - commissione) };
      }).sort((a, b) => b.incasso - a.incasso),
      promoter: [...perPromoter.entries()].map(([codice, rr]) => ({
        id: ctx.idPromoter.get(codice) ?? null,
        nome: ctx.nomiPromoter.get(codice) ?? `Codice ${codice}`,
        codice,
        prenotazioni: rr.length,
        passeggeri: sommaPasseggeri(rr),
        incasso: sommaTotali(rr),
        commissione: commissioniPromoter.get(codice) ?? 0,
        andamento: perIntervallo(rr, (r) => r.creataIl, (r) => r.passeggeri, p.intervalli),
      })).sort((a, b) => b.incasso - a.incasso),
      coupon: [...perCoupon.entries()].map(([codice, rr]) => {
        const promoterId = ctx.coupon.get(codice)?.promoterId ?? null;
        return {
          codice,
          promoterNome: promoterId ? ctx.nomiPromoterPerId.get(promoterId) ?? null : null,
          usi: rr.length,
          passeggeri: sommaPasseggeri(rr),
          sconto: arrotondaEuro(rr.reduce((s, r) => s + Number(r.sconto), 0)),
          incasso: sommaTotali(rr),
        };
      }).sort((a, b) => b.incasso - a.incasso),
      offerte: [...perOfferta.entries()].map(([offertaId, rr]) => ({
        id: offertaId,
        nome: offertaPerId.get(offertaId)?.nome ?? '—',
        eventoArtista: offertaPerId.get(offertaId)?.artista ?? '—',
        prenotazioni: rr.length,
        passeggeri: sommaPasseggeri(rr),
        incasso: sommaTotali(rr),
      })).sort((a, b) => b.incasso - a.incasso),
      anticipo: FASCE_ANTICIPO.map((f, i) => ({ fascia: f.etichetta, passeggeri: anticipo[i], percentuale: percentuale(anticipo[i], passeggeriTotali) })),
      pagamento: {
        completo: righe.length - acconti.length,
        acconto: acconti.length,
        daSaldare: daSaldare.length,
        saldiScaduti: daSaldare.filter((r) => r.scadenzaSaldo && r.scadenzaSaldo < adesso).length,
        daIncassare: arrotondaEuro(daSaldare.reduce((s, r) => s + (r.totale - r.pagato), 0)),
      },
      bundle: {
        prenotazioni: righeBundle.length,
        passeggeri: sommaPasseggeri(righeBundle),
        incasso: sommaTotali(righeBundle),
        sconto: arrotondaEuro(righeBundle.reduce((s, r) => s + Number(r.scontoBundle ?? 0), 0)),
      },
    };
  },

  async clienti(p: Periodo) {
    const oggi = oggiRoma();
    const [righe, righeConfronto, tutte] = await Promise.all([
      leggiPrenotazioni(fatteTra(p.inizio, p.fine)),
      p.confronto ? leggiPrenotazioni(fatteTra(p.confronto.inizio, p.confronto.fine)) : Promise.resolve(null),
      db.select({ utenteId: prenotazioni.utenteId, creataIl: prenotazioni.creataIl }).from(prenotazioni)
        .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
        .where(and(eq(prenotazioni.stato, 'CONFERMATA'), eventoValido)),
    ]);

    const primaPrenotazione = new Map<string, number>();
    for (const r of tutte) {
      const t = r.creataIl.getTime();
      const prima = primaPrenotazione.get(r.utenteId);
      if (prima === undefined || t < prima) primaPrenotazione.set(r.utenteId, t);
    }
    const conta = (rr: PrenotazioneStatistica[], inizio: Date) => {
      const clienti = new Set(rr.map((r) => r.utenteId));
      let nuovi = 0;
      for (const u of clienti) if ((primaPrenotazione.get(u) ?? 0) >= inizio.getTime()) nuovi += 1;
      return { clienti: clienti.size, nuovi, diRitorno: clienti.size - nuovi };
    };
    const attuali = conta(righe, p.inizio);
    const precedenti = righeConfronto && p.confronto ? conta(righeConfronto, p.confronto.inizio) : null;

    // Per ogni cliente la sua prima prenotazione del periodo (per l'età al giorno dell'evento).
    const primaDelPeriodo = new Map<string, PrenotazioneStatistica>();
    for (const r of righe) {
      const gia = primaDelPeriodo.get(r.utenteId);
      if (!gia || r.creataIl < gia.creataIl) primaDelPeriodo.set(r.utenteId, r);
    }
    const anagrafica = await aBlocchiDaDb([...primaDelPeriodo.keys()], (ids) => db.select({
      id: utenti.id,
      dataNascita: utenti.dataNascita,
      haPassword: sql<boolean>`${utenti.passwordHash} is not null`,
      invitato: sql<boolean>`${utenti.invitatoDaUtenteId} is not null`,
    }).from(utenti).where(inArray(utenti.id, ids)));

    const fasce = FASCE_ETA.map(() => 0);
    let conEta = 0;
    for (const u of anagrafica) {
      if (!u.dataNascita) continue;
      const fascia = fasciaEta(etaAl(giornoARoma(u.dataNascita), giornoARoma(primaDelPeriodo.get(u.id)!.eventoData)));
      if (fascia === null) continue;
      fasce[fascia] += 1;
      conEta += 1;
    }

    const perCitta = new Map<string, number>();
    for (const r of righe) {
      const citta = r.fermataCitta.trim();
      perCitta.set(citta, (perCitta.get(citta) ?? 0) + r.passeggeri);
    }
    const cittaOrdinate = [...perCitta.entries()].sort((a, b) => b[1] - a[1]);
    const altre = cittaOrdinate.slice(TOP_FERMATE);

    return {
      periodo: periodoPerRisposta(p),
      clienti: { attuale: attuali.clienti, precedente: precedenti?.clienti ?? null },
      nuovi: { attuale: attuali.nuovi, precedente: precedenti?.nuovi ?? null },
      diRitorno: { attuale: attuali.diRitorno, precedente: precedenti?.diRitorno ?? null },
      ospiti: anagrafica.filter((u) => !u.haPassword).length,
      conAccount: anagrafica.filter((u) => u.haPassword).length,
      invitati: anagrafica.filter((u) => u.invitato).length,
      eta: conEta >= MINIMO_PERSONE_FASCE
        ? FASCE_ETA.map((f, i) => ({ fascia: f.etichetta, persone: fasce[i], percentuale: percentuale(fasce[i], conEta) }))
        : null,
      etaNonIndicata: anagrafica.length - conEta,
      fermate: cittaOrdinate.slice(0, TOP_FERMATE).map(([citta, passeggeri]) => ({ citta, passeggeri })),
      altreFermate: { numero: altre.length, passeggeri: altre.reduce((s, [, n]) => s + n, 0) },
      mesiCoorti: MESI_COORTI,
      coorti: calcolaCoorti(tutte.map((r) => ({ utenteId: r.utenteId, giorno: giornoARoma(r.creataIl) })), oggi),
    };
  },

  async costi(p: Periodo) {
    const eventiPeriodo = await eventiTra(p.inizio, p.fine);
    const ids = eventiPeriodo.map((e) => e.id);
    const [dati, righeTratte, cancellate, rimborsi, fornitoriPeriodo] = await Promise.all([
      caricaDatiEventi(ids),
      db.select({ id: tragitti.id, nome: tragitti.nome, arrivoCitta: tragitti.arrivoCitta, prezzo: tragitti.preventivoCosto, km: tragitti.kmAccettati, data: eventi.data, artista: eventi.artista })
        .from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
        .where(and(eventoValido, gte(eventi.data, p.inizio), lt(eventi.data, p.fine), isNull(tragitti.eliminatoIl), isNotNull(tragitti.preventivoCosto), isNotNull(tragitti.fornitoreId)))
        .orderBy(desc(eventi.data)),
      // "importo" = quanto era stato pagato (per un acconto non saldato, l'acconto).
      db.select({ passeggeri: prenotazioni.passeggeri, totale: prenotazioni.totale, cancellataIl: prenotazioni.cancellataIl })
        .from(prenotazioni).innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
        .where(and(eq(prenotazioni.stato, 'CANCELLATA'), eventoValido, gte(prenotazioni.cancellataIl, p.inizio), lt(prenotazioni.cancellataIl, p.fine))),
      db.select({ stato: richiesteRimborso.stato, origine: richiesteRimborso.origine, totale: prenotazioni.totale })
        .from(richiesteRimborso)
        .innerJoin(prenotazioni, eq(prenotazioni.id, richiesteRimborso.prenotazioneId))
        .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
        .where(and(eventoValido, gte(richiesteRimborso.richiestaIl, p.inizio), lt(richiesteRimborso.richiestaIl, p.fine))),
      statisticheFornitori(p.inizio, p.fine),
    ]);
    const economia = economiaEventi(ids, dati);
    const tuttiEco = [...economia.values()];
    const intervalliCancellazioni = raggruppa(cancellate, (c) => String(c.cancellataIl ? indiceIntervallo(c.cancellataIl, p.intervalli) : -1));

    return {
      periodo: periodoPerRisposta(p),
      totali: {
        incasso: arrotondaEuro(tuttiEco.reduce((s, e) => s + e.incasso, 0)),
        costoBus: arrotondaEuro(tuttiEco.reduce((s, e) => s + e.costoBus, 0)),
        commissioni: arrotondaEuro(tuttiEco.reduce((s, e) => s + e.commissioni, 0)),
        margine: arrotondaEuro(tuttiEco.reduce((s, e) => s + e.margine, 0)),
        eventiConCostiMancanti: tuttiEco.filter(costiMancanti).length,
      },
      eventi: eventiPeriodo
        .map((e) => ({ e, eco: economia.get(e.id)! }))
        .filter(({ eco }) => eco.passeggeri > 0 || eco.bus > 0)
        .map(({ e, eco }) => ({
          id: e.id, artista: e.artista, citta: e.citta, data: e.data.toISOString(),
          passeggeri: eco.passeggeri, incasso: eco.incasso, bus: eco.bus, costoBus: eco.costoBus, costoCompleto: costoCompleto(eco),
          commissioni: eco.commissioni, margine: eco.margine,
        })),
      fornitori: fornitoriPeriodo,
      tratte: await tratteConPartenza(righeTratte),
      cancellazioni: {
        prenotazioni: cancellate.length,
        passeggeri: sommaPasseggeri(cancellate),
        importo: sommaTotali(cancellate),
        perIntervallo: p.intervalli.map((_, i) => {
          const nellIntervallo = intervalliCancellazioni.get(String(i)) ?? [];
          return { prenotazioni: nellIntervallo.length, importo: sommaTotali(nellIntervallo) };
        }),
      },
      rimborsi: {
        richieste: rimborsi.length,
        inAttesa: rimborsi.filter((r) => r.stato === 'IN_ATTESA').length,
        approvate: rimborsi.filter((r) => r.stato === 'APPROVATA').length,
        rifiutate: rimborsi.filter((r) => r.stato === 'RIFIUTATA').length,
        daVariazione: rimborsi.filter((r) => r.origine === 'VARIAZIONE').length,
        importoApprovato: sommaTotali(rimborsi.filter((r) => r.stato === 'APPROVATA')),
      },
    };
  },
};

// ---------------------------------------------------------------- Aiuti del servizio

/** Eventi già passati da confrontare: dello stesso genere, altrimenti della
 *  stessa città; i più recenti, solo quelli con almeno una prenotazione. */
async function eventiSimili(e: RigaEvento, primaDi: Date): Promise<{ criterio: 'genere' | 'citta' | null; ids: string[] }> {
  for (const criterio of ['genere', 'citta'] as const) {
    const valore = (criterio === 'genere' ? e.genere : e.citta).trim().toLowerCase();
    if (!valore) continue;
    const colonna = criterio === 'genere' ? eventi.genere : eventi.citta;
    const trovati = await db.select({ id: eventi.id }).from(eventi)
      .where(and(
        eventoValido,
        lt(eventi.data, primaDi),
        ne(eventi.id, e.id),
        sql`lower(trim(${colonna})) = ${valore}`,
        sql`exists (select 1 from ${prenotazioni} where ${prenotazioni.eventoId} = ${eventi.id} and ${prenotazioni.stato} = 'CONFERMATA')`,
      ))
      .orderBy(desc(eventi.data))
      .limit(MAX_EVENTI_SIMILI);
    if (trovati.length) return { criterio, ids: trovati.map((t) => t.id) };
  }
  return { criterio: null, ids: [] };
}

/** Una riga per fermata di ogni tragitto (città ripetute nello stesso
 *  tragitto unite: le prenotazioni salvano solo la città), più le città
 *  prenotate che oggi non corrispondono a nessuna fermata (fermata rinominata
 *  o tragitto eliminato), così i totali tornano. */
async function fermateEvento(eventoId: string, dati: DatiEventi, attese: { tragittoId: string | null; fermataId: string | null }[]) {
  const tragittiIds = [...new Set([...dati.strutture.tragitti.map((t) => t.id), ...dati.righe.map((r) => r.tragittoId)])];
  const [righeFermate, nomiTragitti] = tragittiIds.length
    ? await Promise.all([
      db.select({ id: fermate.id, tragittoId: fermate.tragittoId, citta: fermate.citta, attivo: fermate.attivo, prezzo: fermate.prezzo })
        .from(fermate).where(inArray(fermate.tragittoId, tragittiIds)).orderBy(asc(fermate.ordine)),
      db.select({ id: tragitti.id, nome: tragitti.nome, eliminatoIl: tragitti.eliminatoIl }).from(tragitti)
        .where(and(inArray(tragitti.id, tragittiIds), eq(tragitti.eventoId, eventoId))),
    ])
    : [[], []];
  const nomeTragitto = new Map(nomiTragitti.map((t) => [t.id, t.eliminatoIl ? `${t.nome} (eliminato)` : t.nome]));
  const chiave = (tragittoId: string, citta: string) => `${tragittoId} ${citta}`;

  const prenotate = new Map<string, { passeggeri: number; incasso: number; giorniPesati: number }>();
  for (const r of dati.righe) {
    const k = chiave(r.tragittoId, r.fermataCitta);
    const voce = prenotate.get(k) ?? { passeggeri: 0, incasso: 0, giorniPesati: 0 };
    voce.passeggeri += r.passeggeri;
    voce.incasso += r.totale;
    voce.giorniPesati += Math.max(0, giorniTra(giornoARoma(r.creataIl), giornoARoma(r.eventoData))) * r.passeggeri;
    prenotate.set(k, voce);
  }
  const attesePerFermata = new Map<string, number>();
  for (const a of attese) if (a.fermataId) attesePerFermata.set(a.fermataId, (attesePerFermata.get(a.fermataId) ?? 0) + 1);

  const righe = new Map<string, { tragittoNome: string; citta: string; attiva: boolean; prezzo: number | null; listaAttesa: number }>();
  for (const f of righeFermate) {
    if (!nomeTragitto.has(f.tragittoId)) continue;
    const k = chiave(f.tragittoId, f.citta);
    const gia = righe.get(k);
    const inAttesa = attesePerFermata.get(f.id) ?? 0;
    if (gia) {
      gia.attiva ||= f.attivo;
      gia.listaAttesa += inAttesa;
      continue;
    }
    righe.set(k, { tragittoNome: nomeTragitto.get(f.tragittoId)!, citta: f.citta, attiva: f.attivo, prezzo: f.prezzo === null ? null : Number(f.prezzo), listaAttesa: inAttesa });
  }
  for (const r of dati.righe) {
    const k = chiave(r.tragittoId, r.fermataCitta);
    if (!righe.has(k)) righe.set(k, { tragittoNome: nomeTragitto.get(r.tragittoId) ?? '—', citta: r.fermataCitta, attiva: false, prezzo: null, listaAttesa: 0 });
  }

  return [...righe.entries()].map(([k, f]) => {
    const vendute = prenotate.get(k);
    return {
      ...f,
      passeggeri: vendute?.passeggeri ?? 0,
      incasso: arrotondaEuro(vendute?.incasso ?? 0),
      anticipoMedioGiorni: vendute && vendute.passeggeri > 0 ? Math.round(vendute.giorniPesati / vendute.passeggeri) : null,
    };
  });
}

/** Per fornitore, sulle richieste di preventivo fatte nel periodo: risposte,
 *  tempo di risposta (valore centrale, in ore), volte scelto e prezzo medio
 *  dei preventivi accettati. */
async function statisticheFornitori(inizio: Date, fine: Date) {
  const righe = await db.select({
    fornitoreId: preventiviRichieste.fornitoreId,
    nome: fornitori.nome,
    tragittoId: preventiviRichieste.tragittoId,
    creataIl: preventiviRichieste.creataIl,
    rispostaIl: preventiviRisposte.inviataIl,
    fornitoreScelto: tragitti.fornitoreId,
    preventivoCosto: tragitti.preventivoCosto,
  }).from(preventiviRichieste)
    .innerJoin(fornitori, eq(fornitori.id, preventiviRichieste.fornitoreId))
    .innerJoin(tragitti, eq(tragitti.id, preventiviRichieste.tragittoId))
    .leftJoin(preventiviRisposte, eq(preventiviRisposte.richiestaId, preventiviRichieste.id))
    .where(and(gte(preventiviRichieste.creataIl, inizio), lt(preventiviRichieste.creataIl, fine)));

  return [...raggruppa(righe, (r) => r.fornitoreId).values()].map((sue) => {
    const conRisposta = sue.filter((r) => r.rispostaIl !== null);
    const ore = conRisposta.map((r) => Math.max(0, (r.rispostaIl!.getTime() - r.creataIl.getTime()) / 3_600_000));
    // "Scelto": i tragitti per cui è stato contattato che oggi hanno lui come
    // fornitore del preventivo accettato, una volta per tragitto.
    const vinti = [...raggruppa(sue.filter((r) => r.fornitoreScelto === r.fornitoreId), (r) => r.tragittoId).values()].map((rr) => rr[0]);
    const prezzi = vinti.filter((r) => r.preventivoCosto !== null).map((r) => Number(r.preventivoCosto));
    const oreMediana = mediana(ore);
    return {
      id: sue[0].fornitoreId,
      nome: sue[0].nome,
      richieste: sue.length,
      risposte: conRisposta.length,
      tassoRisposta: percentuale(conRisposta.length, sue.length),
      oreRispostaMediana: oreMediana === null ? null : Math.round(oreMediana * 10) / 10,
      scelto: vinti.length,
      prezzoMedio: prezzi.length ? arrotondaEuro(prezzi.reduce((a, b) => a + b, 0) / prezzi.length) : null,
    };
  }).sort((a, b) => b.scelto - a.scelto || b.richieste - a.richieste);
}

/** Tratte con un preventivo accettato: la partenza è la prima fermata attiva
 *  (se nessuna è attiva, la prima). */
async function tratteConPartenza(righe: { id: string; nome: string; arrivoCitta: string | null; prezzo: string | null; km: number | null; data: Date; artista: string }[]) {
  const righeFermate = await aBlocchiDaDb(righe.map((r) => r.id), (ids) => db.select({ tragittoId: fermate.tragittoId, citta: fermate.citta, attivo: fermate.attivo })
    .from(fermate).where(inArray(fermate.tragittoId, ids)).orderBy(asc(fermate.ordine)));
  const partenza = new Map<string, string>();
  for (const f of righeFermate) if (f.attivo && !partenza.has(f.tragittoId)) partenza.set(f.tragittoId, f.citta);
  for (const f of righeFermate) if (!partenza.has(f.tragittoId)) partenza.set(f.tragittoId, f.citta);
  return righe.map((r) => {
    const prezzo = Number(r.prezzo);
    return {
      partenza: partenza.get(r.id) ?? '—',
      arrivo: r.arrivoCitta ?? '—',
      prezzo,
      km: r.km === null ? null : Math.round(r.km),
      euroKm: r.km ? arrotondaEuro(prezzo / r.km) : null,
      data: r.data.toISOString(),
      nomeTragitto: r.nome,
      artista: r.artista,
    };
  });
}
