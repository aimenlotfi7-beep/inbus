import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, lineaFermate, linee, prenotazioni, tragitti, utenti } from '../../db/schema.js';
import { leggiPostiPerBus, leggiSogliaOccupazionePareggio } from '../impostazioni/impostazioni.routes.js';
import type { Lettore } from '../prenotazioni/partenza.js';
import { etaPrenotazione, primaFermataDellaLinea, riempiBus, type BusDaRiempire, type GruppoPasseggeri } from '../prenotazioni/riempimento-bus.js';
import { ricollegaPreventiviBus } from '../preventivi/preventivi-bus.service.js';
import { invioAutomaticoService } from '../preventivi/invio-automatico.service.js';

/** Proposte "da confermare", create e tolte in automatico (pagina "Da confermare").
 *
 *  Regole decise dal proprietario (settembre 2026):
 *  - si prova lo smistamento su tutte le prenotazioni confermate, con la
 *    stessa regola dello smistamento vero (prenotazioni/riempimento-bus.ts:
 *    gruppi interi, solo sui bus delle linee che si fermano alla loro
 *    fermata, chi ha già un bus resta lì). Contano i bus confermati con i
 *    loro posti e quelli proposti con i posti della quotazione;
 *  - quando chi resterebbe senza posto arriva al pareggio (una percentuale
 *    dei posti della quotazione, in Impostazioni) nasce una proposta, e si
 *    riprova con quel bus in più. Con un bus da 50 e pareggio 30 e gruppi
 *    piccoli su una fermata sola: proposte a 30, 80, 130;
 *  - di norma la proposta è un BUS in più sulla linea principale, con le
 *    stesse fermate: confermandola si inseriscono solo i dati del bus;
 *  - una LINEA nuova solo se TUTTI quelli senza posto salgono dopo le prime
 *    fermate consecutive: parte dalla prima fermata di chi è senza posto;
 *  - il primo bus di un tragitto senza linee nasce con la linea su tutte le
 *    fermate.
 *  Un gruppo più grande di un bus non entra in nessun bus, nemmeno in uno
 *  nuovo: non fa nascere proposte (resta "senza posto", da sistemare a mano).
 *
 *  Nel database una proposta è una riga di `linee` con daConfermare = true e
 *  le sue fermate: una proposta di bus ha le stesse fermate della linea a cui
 *  va il bus (eventiService.confermaLinea aggiunge lì il bus e toglie la
 *  proposta), una proposta di linea ha le fermate da cui partire. Le
 *  proposte non hanno bus, non cambiano i posti in vendita e non avvisano
 *  nessuno; spariscono da sole se non servono più. Le vendite non si
 *  fermano mai per i posti dei bus.
 *
 *  Una linea confermata ma senza bus conta come un bus con i posti della
 *  quotazione (senza quotazione, i posti per bus delle Impostazioni). */

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

export interface EsitoAllineamento { create: number; tolte: number }

export type Proposta = { tipo: 'bus'; fermateIds: string[] } | { tipo: 'linea'; fermateIds: string[] };

/** Il contatore del pareggio nella pagina Linee: conta chi resterebbe senza
 *  posto, per il prossimo bus non ancora proposto ("3° bus"), da 0 al
 *  pareggio. Arriva al pareggio proprio quando nasce la proposta successiva. */
export interface ContatorePareggio { bus: number; contati: number; pareggio: number }

export interface DatiProposte {
  /** Le prenotazioni confermate del tragitto, con età e bus già assegnato. */
  gruppi: GruppoPasseggeri[];
  /** I bus confermati (e le linee confermate senza bus, come un bus da postiPerBus). */
  bus: BusDaRiempire[];
  /** Quanti sono quei bus. */
  busConfermati: number;
  /** Le fermate attive nell'ordine del percorso. */
  fermateOrdinate: { id: string; citta: string }[];
  /** Le fermate della linea a cui va un bus in più (tutte le attive se non c'è ancora una linea). */
  fermateLineaPrincipale: string[];
  lineeConfermate: number;
  postiPareggio: number | null;
  postiPerBus: number;
}

/** Le proposte che servono, in ordine, e il contatore del pareggio dopo di loro. */
export function calcolaProposte(dati: DatiProposte): { proposte: Proposta[]; contatore: ContatorePareggio | null } {
  const { postiPareggio, postiPerBus, fermateOrdinate } = dati;
  if (postiPareggio === null || postiPerBus <= 0 || fermateOrdinate.length === 0) return { proposte: [], contatore: null };
  const pareggio = Math.max(1, postiPareggio);
  const ordineCitta = fermateOrdinate.map((f) => f.citta);
  const cittaDi = new Map(fermateOrdinate.map((f) => [f.id, f.citta]));
  const postiMassimi = Math.max(postiPerBus, ...dati.bus.map((b) => b.postiBus));

  const proposte: Proposta[] = [];
  const bus = [...dati.bus];
  let senzaPostoPrima = Number.POSITIVE_INFINITY;
  let fuori: GruppoPasseggeri[] = [];
  for (;;) {
    // Chi non entra: solo i gruppi di una fermata attiva che un bus potrebbe portare.
    fuori = riempiBus(dati.gruppi, bus).senzaPosto.filter((g) => ordineCitta.includes(g.fermataCitta) && g.passeggeri <= postiMassimi);
    const senzaPosto = fuori.reduce((s, g) => s + g.passeggeri, 0);
    // Un bus in più che non fa salire nessuno (fermate che nessuna proposta copre): ci si ferma.
    if (senzaPosto < pareggio || senzaPosto >= senzaPostoPrima || proposte.length >= 100) break;
    senzaPostoPrima = senzaPosto;

    const primaFuori = Math.min(...fuori.map((g) => ordineCitta.indexOf(g.fermataCitta)));
    const principaleCopre = fuori.every((g) => dati.fermateLineaPrincipale.some((id) => cittaDi.get(id) === g.fermataCitta));
    const primoBusDelTragitto = dati.lineeConfermate === 0 && proposte.length === 0;
    const proposta: Proposta = primoBusDelTragitto || (primaFuori === 0 && principaleCopre)
      ? { tipo: 'bus', fermateIds: dati.fermateLineaPrincipale }
      : { tipo: 'linea', fermateIds: fermateOrdinate.slice(primaFuori).map((f) => f.id) };
    proposte.push(proposta);
    const cittaProposta = new Set(proposta.fermateIds.map((id) => cittaDi.get(id)).filter((c): c is string => !!c));
    bus.push({ busId: `proposta-${proposte.length}`, postiBus: postiPerBus, fermate: cittaProposta, primaFermata: primaFermataDellaLinea(cittaProposta, ordineCitta) });
  }
  return {
    proposte,
    contatore: {
      bus: dati.busConfermati + proposte.length + 1,
      contati: Math.min(pareggio, fuori.reduce((s, g) => s + g.passeggeri, 0)),
      pareggio,
    },
  };
}

export const propostePerTragitto = (dati: DatiProposte) => calcolaProposte(dati).proposte;
export const contatorePerTragitto = (dati: DatiProposte) => calcolaProposte(dati).contatore;

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
  contatore: ContatorePareggio | null;
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

  const [righePrenotazioni, righeLinee, righeFermate] = await Promise.all([
    lettore.select({
      id: prenotazioni.id, fermataCitta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri, creataIl: prenotazioni.creataIl,
      busId: prenotazioni.busId, dataNascitaTitolare: utenti.dataNascita,
    }).from(prenotazioni).innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA'))),
    lettore.select({ id: linee.id, nome: linee.nome, ordine: linee.ordine, daConfermare: linee.daConfermare, creatoIl: linee.creatoIl })
      .from(linee).where(eq(linee.tragittoId, tragittoId)),
    lettore.select({ id: fermate.id, citta: fermate.citta, orario: fermate.orario, ordine: fermate.ordine }).from(fermate)
      .where(and(eq(fermate.tragittoId, tragittoId), eq(fermate.attivo, true))),
  ]);
  const idsLinee = righeLinee.map((l) => l.id);
  const [righeBus, righeLineaFermate] = idsLinee.length
    ? await Promise.all([
      lettore.select({ id: busFisici.id, lineaId: busFisici.lineaId, postiBus: busFisici.postiBus }).from(busFisici)
        .where(inArray(busFisici.lineaId, idsLinee)).orderBy(asc(busFisici.creatoIl), asc(busFisici.id)),
      lettore.select({ lineaId: lineaFermate.lineaId, fermataId: lineaFermate.fermataId, citta: fermate.citta }).from(lineaFermate)
        .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId)).where(inArray(lineaFermate.lineaId, idsLinee)),
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
  const confermate = righeLinee.filter((l) => !bozze.some((b) => b.id === l.id))
    .sort((a, b) => a.creatoIl.getTime() - b.creatoIl.getTime() || a.ordine - b.ordine);

  const fermateOrdinate = [...righeFermate].sort(perOrario).map((f) => ({ id: f.id, citta: f.citta }));
  const ordineCitta = fermateOrdinate.map((f) => f.citta);
  // I bus veri, linea per linea (per nascita); una linea confermata senza bus vale un bus da postiPerBus.
  const busConfermatiDaRiempire: BusDaRiempire[] = confermate.flatMap((l) => {
    const cittaLinea = new Set(righeLineaFermate.filter((r) => r.lineaId === l.id).map((r) => r.citta));
    const primaFermata = primaFermataDellaLinea(cittaLinea, ordineCitta);
    const busLinea = righeBus.filter((b) => b.lineaId === l.id);
    return busLinea.length > 0
      ? busLinea.map((b) => ({ busId: b.id, postiBus: b.postiBus ?? 0, fermate: cittaLinea, primaFermata }))
      : [{ busId: `linea-senza-bus-${l.id}`, postiBus: postiPerBus, fermate: cittaLinea, primaFermata }];
  });
  const gruppi: GruppoPasseggeri[] = righePrenotazioni.map((r) => ({
    id: r.id, fermataCitta: r.fermataCitta, passeggeri: r.passeggeri, creataIl: r.creataIl,
    // Un bus di una linea che non c'è più (o di una proposta) non tiene il posto.
    busId: r.busId && busConfermatiDaRiempire.some((b) => b.busId === r.busId) ? r.busId : null,
    eta: etaPrenotazione([], r.dataNascitaTitolare, t.eventoData),
  }));
  // Linea principale: quella confermata con più fermate attive (a parità, la prima creata).
  const idsAttive = new Set(righeFermate.map((f) => f.id));
  const principale = [...confermate]
    .sort((a, b) => a.ordine - b.ordine)
    .reduce<{ linea: typeof confermate[number]; fermate: string[] } | null>((migliore, l) => {
      const fermateAttive = fermateDiLinea(l.id).filter((id) => idsAttive.has(id));
      return !migliore || fermateAttive.length > migliore.fermate.length ? { linea: l, fermate: fermateAttive } : migliore;
    }, null);

  const { proposte, contatore } = calcolaProposte({
    gruppi,
    bus: busConfermatiDaRiempire,
    busConfermati: busConfermatiDaRiempire.length,
    fermateOrdinate,
    fermateLineaPrincipale: principale ? principale.fermate : fermateOrdinate.map((f) => f.id),
    lineeConfermate: confermate.length,
    postiPareggio: t.preventivoPostiBus ? Math.round(t.preventivoPostiBus * (soglia / 100)) : null,
    postiPerBus,
  });
  return {
    necessarie: proposte,
    contatore,
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

  const nuoveProposte: string[] = [];
  const esitoTransazione = await db.transaction(async (tx) => {
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
      // I preventivi già chiesti per una proposta uguale, sparita e rinata, tornano a valere.
      await ricollegaPreventiviBus(tx, tragittoId, nuova.id, proposta.fermateIds);
      nuoveProposte.push(nuova.id);
      esito.create += 1;
    }
    return esito;
  });
  // Dopo il salvataggio, in sottofondo: i preventivi per i bus delle proposte
  // appena nate partono da soli (non rallentano la prenotazione che le ha
  // fatte nascere; perProposta non lancia mai).
  for (const id of nuoveProposte) void invioAutomaticoService.perProposta(id);
  return esitoTransazione;
}

export const lineeDaConfermareService = {
  allinea,

  /** Il contatore del pareggio di un tragitto; null se non in vendita, senza
   *  quotazione o con l'evento passato. */
  async contatore(tragittoId: string): Promise<ContatorePareggio | null> {
    const [soglia, postiPerBus] = await Promise.all([leggiSogliaOccupazionePareggio(), leggiPostiPerBus()]);
    return (await leggiStato(db, tragittoId, soglia, postiPerBus))?.contatore ?? null;
  },

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
