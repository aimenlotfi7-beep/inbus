import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, lineaFermate, linee, prenotazioni, tragitti } from '../../db/schema.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import type { Lettore } from '../prenotazioni/partenza.js';

/** Proposte "da confermare", create e tolte in automatico (pagina "Da confermare").
 *
 *  Regole decise dal proprietario (settembre 2026):
 *  - la prima proposta nasce quando i passeggeri confermati del tragitto
 *    arrivano al pareggio (una percentuale dei posti del preventivo, in
 *    Impostazioni: es. 30 su un bus da 50);
 *  - il pareggio riparte dopo ogni bus: la proposta successiva nasce solo
 *    quando i passeggeri superano i posti dei bus confermati (e delle
 *    proposte precedenti) di un altro pareggio. Bus da 50 e pareggio 30:
 *    proposte a 30, 80, 130; con un bus vero da 54 la seconda a 84;
 *  - di norma la proposta è un BUS in più sulla linea che c'è già, con le
 *    stesse fermate: confermandola si inseriscono solo i dati del bus;
 *  - una LINEA nuova si propone solo se un bus può partire saltando le prime
 *    fermate consecutive: i prenotati delle fermate saltate stanno già nei
 *    bus esistenti e quelli dalla fermata di partenza in poi arrivano da
 *    soli al pareggio. Si salta il più possibile.
 *
 *  Nel database una proposta è una riga di `linee` con daConfermare = true e
 *  le sue fermate: una proposta di bus ha le stesse fermate della linea a cui
 *  va il bus (eventiService.confermaLinea aggiunge lì il bus e toglie la
 *  proposta), una proposta di linea ha le fermate da cui partire. Le
 *  proposte non hanno bus, non cambiano i posti in vendita e non avvisano
 *  nessuno; spariscono da sole se non servono più. Le vendite non si
 *  fermano mai per i posti dei bus.
 *
 *  Posti per il calcolo: una linea con bus conta i posti dei suoi bus; una
 *  linea confermata ma senza bus conta i posti del preventivo (senza
 *  preventivo, i posti per bus delle Impostazioni). */

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

export interface EsitoAllineamento { create: number; tolte: number }

export type Proposta = { tipo: 'bus'; fermateIds: string[] } | { tipo: 'linea'; fermateIds: string[] };

/** Le proposte che servono, in ordine. `fermateOrdinate`: le fermate attive
 *  nell'ordine del percorso, con i prenotati; `fermateLineaPrincipale`: le
 *  fermate della linea a cui va un bus in più (tutte le attive se non c'è
 *  ancora una linea). */
export function propostePerTragitto(dati: {
  passeggeri: number;
  postiPareggio: number | null;
  postiPerBus: number;
  postiConfermati: number;
  lineeConfermate: number;
  fermateOrdinate: { id: string; prenotati: number }[];
  fermateLineaPrincipale: string[];
}): Proposta[] {
  const { passeggeri, postiPareggio, postiPerBus, lineeConfermate, fermateOrdinate, fermateLineaPrincipale } = dati;
  if (postiPareggio === null || postiPerBus <= 0 || passeggeri <= 0 || fermateOrdinate.length === 0) return [];
  const pareggio = Math.max(1, postiPareggio);
  const proposte: Proposta[] = [];
  let posti = dati.postiConfermati;
  while (passeggeri >= posti + pareggio && proposte.length < 100) {
    let proposta: Proposta = { tipo: 'bus', fermateIds: fermateLineaPrincipale };
    // La prima proposta di un tragitto senza linee è sempre il primo bus su
    // tutte le fermate: non c'è ancora un bus che serva quelle saltate.
    if (lineeConfermate > 0 || proposte.length > 0) {
      for (let partenza = fermateOrdinate.length - 1; partenza >= 1; partenza--) {
        const saltate = fermateOrdinate.slice(0, partenza).reduce((s, f) => s + f.prenotati, 0);
        const dallaPartenza = fermateOrdinate.slice(partenza).reduce((s, f) => s + f.prenotati, 0);
        if (saltate <= posti && dallaPartenza >= pareggio) {
          proposta = { tipo: 'linea', fermateIds: fermateOrdinate.slice(partenza).map((f) => f.id) };
          break;
        }
      }
    }
    proposte.push(proposta);
    posti += postiPerBus;
  }
  return proposte;
}

/** Per orario, come creaLinea; quelle senza orario in fondo, nell'ordine del tragitto. */
function perOrario<T extends { orario: string | null; ordine: number }>(a: T, b: T) {
  if (!a.orario && !b.orario) return a.ordine - b.ordine;
  if (!a.orario) return 1;
  if (!b.orario) return -1;
  return a.orario.localeCompare(b.orario);
}

const stesseFermate = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

interface Bozza { id: string; nome: string; ordine: number; creatoIl: Date; fermateIds: string[] }

interface StatoProposte {
  necessarie: Proposta[];
  bozze: Bozza[];
  tutte: { id: string; nome: string; ordine: number }[];
  /** Linea a cui va un bus in più, e quanti bus ha già. */
  principale: { nome: string; bus: number } | null;
}

/** Legge il tragitto e calcola le proposte che servono. null se il tragitto
 *  non è in vendita, o l'evento è passato o nel cestino: lì le proposte
 *  restano come sono. */
async function leggiStato(lettore: Lettore, tragittoId: string, soglia: number, postiPerBusImpostazioni: number): Promise<StatoProposte | null> {
  const [t] = await lettore.select({
    stato: tragitti.stato, attivo: tragitti.attivo, eliminatoIl: tragitti.eliminatoIl, preventivoPostiBus: tragitti.preventivoPostiBus,
    eventoData: eventi.data, eventoEliminatoIl: eventi.eliminatoIl,
  }).from(tragitti).innerJoin(eventi, eq(eventi.id, tragitti.eventoId)).where(eq(tragitti.id, tragittoId)).limit(1);
  if (!t || !t.attivo || t.eliminatoIl || t.eventoEliminatoIl || (t.stato !== 'PREZZATO' && t.stato !== 'CONFERMATO')) return null;
  if (t.eventoData.getTime() < Date.now() - UN_GIORNO_MS) return null;

  const [righePrenotati, righeLinee, righeFermate] = await Promise.all([
    lettore.select({ citta: prenotazioni.fermataCitta, passeggeri: sql<number>`coalesce(sum(${prenotazioni.passeggeri}), 0)::int` }).from(prenotazioni)
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA'))).groupBy(prenotazioni.fermataCitta),
    lettore.select({ id: linee.id, nome: linee.nome, ordine: linee.ordine, daConfermare: linee.daConfermare, creatoIl: linee.creatoIl })
      .from(linee).where(eq(linee.tragittoId, tragittoId)),
    lettore.select({ id: fermate.id, citta: fermate.citta, orario: fermate.orario, ordine: fermate.ordine }).from(fermate)
      .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true))),
  ]);
  const idsLinee = righeLinee.map((l) => l.id);
  const [righeBus, righeLineaFermate] = idsLinee.length
    ? await Promise.all([
      lettore.select({ lineaId: busFisici.lineaId, postiBus: busFisici.postiBus }).from(busFisici).where(inArray(busFisici.lineaId, idsLinee)),
      lettore.select({ lineaId: lineaFermate.lineaId, fermataId: lineaFermate.fermataId }).from(lineaFermate).where(inArray(lineaFermate.lineaId, idsLinee)),
    ])
    : [[], []];

  const postiBusPerLinea = new Map<string, number>();
  const busPerLinea = new Map<string, number>();
  for (const b of righeBus) {
    if (!b.lineaId) continue;
    postiBusPerLinea.set(b.lineaId, (postiBusPerLinea.get(b.lineaId) ?? 0) + (b.postiBus ?? 0));
    busPerLinea.set(b.lineaId, (busPerLinea.get(b.lineaId) ?? 0) + 1);
  }
  const fermateDiLinea = (lineaId: string) => righeLineaFermate.filter((r) => r.lineaId === lineaId).map((r) => r.fermataId);

  const postiPerBus = t.preventivoPostiBus ?? postiPerBusImpostazioni;
  // Una proposta con un bus (non dovrebbe capitare: il bus arriva solo
  // confermandola) conta come confermata e non si toglie.
  const bozze: Bozza[] = righeLinee
    .filter((l) => l.daConfermare && !postiBusPerLinea.has(l.id))
    .sort((a, b) => a.creatoIl.getTime() - b.creatoIl.getTime() || a.ordine - b.ordine)
    .map((l) => ({ ...l, fermateIds: fermateDiLinea(l.id) }));
  const confermate = righeLinee.filter((l) => !bozze.some((b) => b.id === l.id));
  const postiConfermati = confermate.reduce((tot, l) => tot + (postiBusPerLinea.get(l.id) ?? postiPerBus), 0);

  const prenotatiPerCitta = new Map(righePrenotati.map((r) => [r.citta, Number(r.passeggeri)]));
  const fermateOrdinate = [...righeFermate].sort(perOrario).map((f) => ({ id: f.id, prenotati: prenotatiPerCitta.get(f.citta) ?? 0 }));
  // Linea principale: quella confermata con più fermate attive (a parità, la prima creata).
  const idsAttive = new Set(righeFermate.map((f) => f.id));
  const principale = [...confermate]
    .sort((a, b) => a.ordine - b.ordine)
    .reduce<{ linea: typeof confermate[number]; fermate: string[] } | null>((migliore, l) => {
      const fermateAttive = fermateDiLinea(l.id).filter((id) => idsAttive.has(id));
      return !migliore || fermateAttive.length > migliore.fermate.length ? { linea: l, fermate: fermateAttive } : migliore;
    }, null);

  const necessarie = propostePerTragitto({
    passeggeri: [...prenotatiPerCitta.values()].reduce((s, n) => s + n, 0),
    postiPareggio: t.preventivoPostiBus ? Math.round(t.preventivoPostiBus * (soglia / 100)) : null,
    postiPerBus,
    postiConfermati,
    lineeConfermate: confermate.length,
    fermateOrdinate,
    fermateLineaPrincipale: principale ? principale.fermate : fermateOrdinate.map((f) => f.id),
  });
  return {
    necessarie,
    bozze,
    tutte: righeLinee,
    principale: principale ? { nome: principale.linea.nome, bus: busPerLinea.get(principale.linea.id) ?? 0 } : null,
  };
}

/** Il nome di ogni proposta: "Bus 2 · Linea 1" per un bus in più su una
 *  linea che c'è; null per una linea nuova ("Linea N", numero libero).
 *  Senza ancora nessuna linea anche il primo bus fa nascere una linea. */
function nomiProposte(stato: Pick<StatoProposte, 'necessarie' | 'principale'>): (string | null)[] {
  let bus = 0;
  return stato.necessarie.map((p) => {
    if (p.tipo !== 'bus' || !stato.principale) return null;
    bus += 1;
    return `Bus ${stato.principale.bus + bus} · ${stato.principale.nome}`;
  });
}

/** Quante proposte salvate corrispondono già, in ordine, a quelle che
 *  servono (stesse fermate e stesso nome). */
function proposteGiaGiuste(stato: StatoProposte): number {
  const nomi = nomiProposte(stato);
  const uguale = (i: number) => {
    const bozza = stato.bozze[i];
    const nome = nomi[i];
    return stesseFermate(bozza.fermateIds, stato.necessarie[i].fermateIds) && (nome ? bozza.nome === nome : /^Linea \d+$/.test(bozza.nome));
  };
  let uguali = 0;
  while (uguali < stato.bozze.length && uguali < stato.necessarie.length && uguale(uguali)) uguali++;
  return uguali;
}

async function allinea(tragittoId: string): Promise<EsitoAllineamento> {
  const [soglia, postiPerBus] = await Promise.all([leggiSogliaOccupazionePareggio(), leggiPostiPerBus()]);
  // Prima senza blocchi: quasi sempre non c'è niente da cambiare.
  const primaLettura = await leggiStato(db, tragittoId, soglia, postiPerBus);
  if (!primaLettura) return { create: 0, tolte: 0 };
  const giuste = proposteGiaGiuste(primaLettura);
  if (giuste === primaLettura.bozze.length && giuste === primaLettura.necessarie.length) return { create: 0, tolte: 0 };

  return db.transaction(async (tx) => {
    const esito: EsitoAllineamento = { create: 0, tolte: 0 };
    // Blocca il tragitto: due prenotazioni nello stesso istante non creano
    // due volte la stessa proposta, e una conferma in corso aspetta.
    const [bloccato] = await tx.select({ id: tragitti.id }).from(tragitti).where(eq(tragitti.id, tragittoId)).for('update').limit(1);
    if (!bloccato) return esito;
    const stato = await leggiStato(tx, tragittoId, soglia, postiPerBus);
    if (!stato) return esito;
    const tenere = proposteGiaGiuste(stato);

    // Via le proposte che non servono più o sono cambiate (restano le prime giuste).
    const daTogliere = stato.bozze.slice(tenere);
    if (daTogliere.length > 0) {
      await tx.delete(linee).where(and(inArray(linee.id, daTogliere.map((l) => l.id)), eq(linee.daConfermare, true)));
      esito.tolte = daTogliere.length;
    }

    const rimaste = stato.tutte.filter((l) => !daTogliere.some((b) => b.id === l.id));
    let numeroLinea = rimaste.reduce((max, l) => Math.max(max, Number(/^Linea (\d+)/.exec(l.nome)?.[1] ?? 0)), 0);
    let ordine = rimaste.reduce((max, l) => Math.max(max, l.ordine + 1), 0);
    const nomi = nomiProposte(stato);
    for (const [i, proposta] of stato.necessarie.entries()) {
      if (i < tenere || proposta.fermateIds.length === 0) continue;
      let nome = nomi[i];
      if (!nome) {
        numeroLinea += 1;
        nome = `Linea ${numeroLinea}`;
      }
      const [nuova] = await tx.insert(linee).values({ tragittoId, nome, ordine, daConfermare: true }).returning({ id: linee.id });
      ordine += 1;
      await tx.insert(lineaFermate).values(proposta.fermateIds.map((fermataId, posizione) => ({ lineaId: nuova.id, fermataId, ordine: posizione })));
      esito.create += 1;
    }
    return esito;
  });
}

export const lineeDaConfermareService = {
  allinea,

  /** Dopo una prenotazione, una cancellazione, un preventivo o un cambio di
   *  linee e bus. Non lancia mai: la modifica è già salvata, e in caso di
   *  problemi ci riprova il giro dell'ora. */
  async allineaSubito(tragittoId: string): Promise<void> {
    try {
      const { create, tolte } = await allinea(tragittoId);
      if (create > 0 || tolte > 0) console.log(`[da confermare] tragitto ${tragittoId}: ${create} proposte create, ${tolte} tolte.`);
    } catch (err) {
      console.error(`[da confermare] tragitto ${tragittoId} non aggiornato (ci riprova il giro dell'ora):`, err);
    }
  },

  /** allineaSubito sul tragitto del bus. Non lancia mai. */
  async allineaSubitoPerBus(busId: string): Promise<void> {
    try {
      const [bus] = await db.select({ tragittoId: linee.tragittoId }).from(busFisici)
        .innerJoin(linee, eq(linee.id, busFisici.lineaId))
        .where(eq(busFisici.id, busId)).limit(1);
      if (bus) await lineeDaConfermareService.allineaSubito(bus.tragittoId);
    } catch (err) {
      console.error(`[da confermare] bus ${busId}: tragitto non aggiornato (ci riprova il giro dell'ora):`, err);
    }
  },

  /** Il giro di ogni ora (e all'avvio): tutti i tragitti in vendita di eventi
   *  non passati. */
  async allineaTutte(): Promise<EsitoAllineamento> {
    const righe = await db.select({ id: tragitti.id }).from(tragitti)
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(and(
        eq(tragitti.attivo, true), isNull(tragitti.eliminatoIl), inArray(tragitti.stato, ['PREZZATO', 'CONFERMATO']),
        isNull(eventi.eliminatoIl), gte(eventi.data, new Date(Date.now() - UN_GIORNO_MS)),
      ));
    const totale: EsitoAllineamento = { create: 0, tolte: 0 };
    for (const { id } of righe) {
      try {
        const esito = await allinea(id);
        totale.create += esito.create;
        totale.tolte += esito.tolte;
      } catch (err) {
        console.error(`[da confermare] tragitto ${id} non aggiornato:`, err);
      }
    }
    return totale;
  },
};
