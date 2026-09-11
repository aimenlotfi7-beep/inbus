import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, lineaFermate, linee, prenotazioni, tragitti, utenti } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import { ticketService } from '../ticket/ticket.service.js';
import { calcolaTempi, leggiOrariTragitto, primaPartenza, type Lettore, type OrariTragitto } from './partenza.js';

/** Smistamento automatico dei passeggeri sui bus — l'unico modo in cui una
 *  prenotazione riceve un bus (l'assegnazione a mano non esiste più).
 *
 *  Regole decise dal proprietario:
 *  - l'unità è la prenotazione intera: un gruppo non si divide mai;
 *  - ordine per età media, dal più grande al più giovane (a parità, chi ha
 *    prenotato prima); senza nessuna data di nascita, in fondo;
 *  - bus in ordine stabile (linee per creazione, poi bus per creazione),
 *    solo quelli delle linee che contengono la fermata della prenotazione;
 *    un gruppo va nel primo bus che ha abbastanza posti, mai oltre la
 *    capienza; se non entra da nessuna parte resta senza bus;
 *  - una prenotazione si assegna dal momento in cui mancano 24 ore alla
 *    SUA partenza (ora di Roma).
 *
 *  Per non far scegliere per primi i passeggeri delle fermate che partono
 *  prima, ogni giro simula l'intero tragitto (le prenotazioni già assegnate
 *  restano ferme, tutte le altre in ordine di età) e poi salva solo quelle
 *  la cui partenza è già entro 24 ore. Con il riempimento "primo bus con
 *  posto" i giri successivi ritrovano lo stesso posto per le altre: il
 *  risultato coincide con l'anteprima (salvo vendite o cancellazioni nel
 *  frattempo). */

const ANNO_MS = 365.2425 * 24 * 60 * 60 * 1000;

interface BusDaRiempire { busId: string; riferimento: string; postiBus: number | null; fermate: Set<string> }
interface LineaDaRiempire { lineaId: string; lineaNome: string; bus: BusDaRiempire[] }
interface PrenotazioneDaSmistare {
  id: string; pnr: string; fermataCitta: string; fermataOrario: string | null;
  passeggeri: number; creataIl: Date; busId: string | null; eta: number | null;
}
interface StatoTragitto { orari: OrariTragitto; linee: LineaDaRiempire[]; prenotazioni: PrenotazioneDaSmistare[] }
interface CaricoBus { passeggeri: number; prenotazioni: number; sommaEta: number; passeggeriConEta: number }

export interface AnteprimaSmistamento {
  smistamentoIl: string | null;
  giaSmistato: boolean;
  linee: { lineaId: string; lineaNome: string; bus: { busId: string; riferimento: string; postiBus: number | null; passeggeri: number; prenotazioni: number; etaMedia: number | null }[] }[];
  senzaPosto: { prenotazioni: number; passeggeri: number };
}

/** Età media (in anni, alla data dell'evento) dei partecipanti che hanno la
 *  data di nascita; se nessuno ce l'ha, quella del titolare; null se manca
 *  anche quella. */
export function etaPrenotazione(dateNascitaPartecipanti: (Date | null)[], dataNascitaTitolare: Date | null, riferimento: Date): number | null {
  const conData = dateNascitaPartecipanti.filter((d): d is Date => d !== null);
  const date = conData.length > 0 ? conData : dataNascitaTitolare ? [dataNascitaTitolare] : [];
  if (date.length === 0) return null;
  return date.reduce((somma, d) => somma + (riferimento.getTime() - d.getTime()) / ANNO_MS, 0) / date.length;
}

function confrontaPerEta(a: PrenotazioneDaSmistare, b: PrenotazioneDaSmistare): number {
  if (a.eta !== b.eta) {
    if (a.eta === null) return 1;
    if (b.eta === null) return -1;
    return b.eta - a.eta;
  }
  const creazione = a.creataIl.getTime() - b.creataIl.getTime();
  if (creazione !== 0) return creazione;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

async function leggiStatoTragitto(lettore: Lettore, tragittoId: string): Promise<StatoTragitto | null> {
  const orari = await leggiOrariTragitto(tragittoId, lettore);
  if (!orari) return null;

  const righeLinee = await lettore.select({ id: linee.id, nome: linee.nome }).from(linee)
    .where(eq(linee.tragittoId, tragittoId))
    .orderBy(asc(linee.creatoIl), asc(linee.ordine), asc(linee.id));
  const lineaIds = righeLinee.map((l) => l.id);
  const righeFermate = lineaIds.length
    ? await lettore.select({ lineaId: lineaFermate.lineaId, citta: fermate.citta }).from(lineaFermate)
      .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
      .where(inArray(lineaFermate.lineaId, lineaIds))
    : [];
  const righeBus = lineaIds.length
    ? await lettore.select({ id: busFisici.id, riferimento: busFisici.riferimento, postiBus: busFisici.postiBus, lineaId: busFisici.lineaId }).from(busFisici)
      .where(inArray(busFisici.lineaId, lineaIds))
      .orderBy(asc(busFisici.creatoIl), asc(busFisici.id))
    : [];

  const lineeDaRiempire = righeLinee.map((l) => {
    const cittaCoperte = new Set(righeFermate.filter((f) => f.lineaId === l.id).map((f) => f.citta));
    return {
      lineaId: l.id,
      lineaNome: l.nome,
      bus: righeBus.filter((b) => b.lineaId === l.id).map((b) => ({ busId: b.id, riferimento: b.riferimento, postiBus: b.postiBus, fermate: cittaCoperte })),
    };
  });

  const righePrenotazioni = await lettore.select({
    id: prenotazioni.id, pnr: prenotazioni.pnr, fermataCitta: prenotazioni.fermataCitta, fermataOrario: prenotazioni.fermataOrario,
    passeggeri: prenotazioni.passeggeri, creataIl: prenotazioni.creataIl, busId: prenotazioni.busId, dataNascitaTitolare: utenti.dataNascita,
  }).from(prenotazioni)
    .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
    .where(and(eq(prenotazioni.tragittoId, tragittoId), eq(prenotazioni.stato, 'CONFERMATA')));

  return {
    orari,
    linee: lineeDaRiempire,
    // I partecipanti oltre al titolare hanno solo nome e cognome (nessuna
    // data di nascita salvata): per ora l'età è quella del titolare.
    prenotazioni: righePrenotazioni.map((r) => ({
      id: r.id, pnr: r.pnr, fermataCitta: r.fermataCitta, fermataOrario: r.fermataOrario,
      passeggeri: r.passeggeri, creataIl: r.creataIl, busId: r.busId,
      eta: etaPrenotazione([], r.dataNascitaTitolare, orari.eventoData),
    })),
  };
}

/** Il riempimento, senza scritture: le prenotazioni già assegnate restano
 *  dove sono, le altre vanno in ordine di età nel primo bus con posto. */
function simula(stato: StatoTragitto) {
  const busInOrdine = stato.linee.flatMap((l) => l.bus);
  const carico = new Map<string, CaricoBus>(busInOrdine.map((b) => [b.busId, { passeggeri: 0, prenotazioni: 0, sommaEta: 0, passeggeriConEta: 0 }]));
  const aggiungi = (busId: string, p: PrenotazioneDaSmistare) => {
    const c = carico.get(busId);
    if (!c) return; // bus di un altro tragitto (dati vecchi): non conta qui
    c.passeggeri += p.passeggeri;
    c.prenotazioni += 1;
    if (p.eta !== null) {
      c.sommaEta += p.eta * p.passeggeri;
      c.passeggeriConEta += p.passeggeri;
    }
  };
  for (const p of stato.prenotazioni) if (p.busId) aggiungi(p.busId, p);

  const assegnazioni = new Map<string, string>();
  const senzaPosto: PrenotazioneDaSmistare[] = [];
  for (const p of stato.prenotazioni.filter((x) => !x.busId).sort(confrontaPerEta)) {
    const bus = busInOrdine.find((b) => b.fermate.has(p.fermataCitta) && (b.postiBus ?? 0) - (carico.get(b.busId)?.passeggeri ?? 0) >= p.passeggeri);
    if (!bus) {
      senzaPosto.push(p);
      continue;
    }
    assegnazioni.set(p.id, bus.busId);
    aggiungi(bus.busId, p);
  }
  return { carico, assegnazioni, senzaPosto };
}

/** Un giro di smistamento su un tragitto, in una transazione che blocca il
 *  tragitto (vendite, bus e linee eliminati nello stesso istante aspettano). */
async function smistaTragitto(tragittoId: string, adesso: Date) {
  return db.transaction(async (tx) => {
    const vuoto = { assegnate: [] as { pnr: string; saldoPagato: boolean }[], senzaPosto: [] as PrenotazioneDaSmistare[] };
    const [bloccato] = await tx.select({ id: tragitti.id }).from(tragitti).where(eq(tragitti.id, tragittoId)).for('update').limit(1);
    if (!bloccato) return vuoto;
    const stato = await leggiStatoTragitto(tx, tragittoId);
    if (!stato) return vuoto;

    const idonee = new Set(stato.prenotazioni
      .filter((p) => !p.busId && calcolaTempi(stato.orari, p.fermataCitta, p.fermataOrario).disponibileDal <= adesso)
      .map((p) => p.id));
    if (idonee.size === 0) return vuoto;

    const { assegnazioni, senzaPosto } = simula(stato);
    for (const [prenotazioneId, busId] of assegnazioni) {
      if (!idonee.has(prenotazioneId)) continue;
      const [riga] = await tx.update(prenotazioni).set({ busId })
        .where(and(eq(prenotazioni.id, prenotazioneId), isNull(prenotazioni.busId), eq(prenotazioni.stato, 'CONFERMATA')))
        .returning({ pnr: prenotazioni.pnr, saldoPagato: prenotazioni.saldoPagato });
      if (riga) vuoto.assegnate.push(riga);
    }
    vuoto.senzaPosto.push(...senzaPosto.filter((p) => idonee.has(p.id)));
    return vuoto;
  });
}

export const smistamentoService = {
  /** Il giro vero (scheduler: all'avvio e ogni ora). Dopo il commit, a chi
   *  ha appena ricevuto il bus parte il biglietto con il bus — solo a saldo
   *  completato: chi ha pagato l'acconto lo riceve quando salda. Un
   *  biglietto per bus: se il bus o la linea vengono eliminati la
   *  prenotazione torna senza bus, e al giro dopo riparte con quello nuovo. */
  async esegui(): Promise<{ assegnate: number; senzaPosto: number }> {
    const adesso = new Date();
    const candidati = await db.selectDistinct({ tragittoId: prenotazioni.tragittoId }).from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(and(eq(prenotazioni.stato, 'CONFERMATA'), isNull(prenotazioni.busId), gte(eventi.data, adesso), isNull(eventi.eliminatoIl)));

    let assegnate = 0;
    let senzaPosto = 0;
    for (const { tragittoId } of candidati) {
      let esito: Awaited<ReturnType<typeof smistaTragitto>>;
      try {
        esito = await smistaTragitto(tragittoId, adesso);
      } catch (err) {
        console.error(`[smistamento] tragitto ${tragittoId} non smistato:`, err);
        continue;
      }
      assegnate += esito.assegnate.length;
      if (esito.senzaPosto.length > 0) {
        senzaPosto += esito.senzaPosto.length;
        const passeggeri = esito.senzaPosto.reduce((somma, p) => somma + p.passeggeri, 0);
        console.warn(`[smistamento] tragitto ${tragittoId}: ${esito.senzaPosto.length} prenotazioni (${passeggeri} passeggeri) restano senza bus — posti finiti o fermata non coperta da nessuna linea. PNR: ${esito.senzaPosto.map((p) => p.pnr).join(', ')}`);
      }
      for (const p of esito.assegnate) {
        if (!p.saldoPagato) continue;
        try {
          const { inviata } = await ticketService.inviaBigliettoConBus(p.pnr);
          if (!inviata) console.error(`[smistamento] biglietto con il bus non inviato (PNR ${p.pnr}).`);
        } catch (err) {
          console.error(`[smistamento] biglietto con il bus non inviato (PNR ${p.pnr}):`, err);
        }
      }
    }
    return { assegnate, senzaPosto };
  },

  /** Stessa logica, nessuna scrittura: come verrebbero riempiti i bus del
   *  tragitto con le prenotazioni di adesso. */
  async anteprima(tragittoId: string): Promise<AnteprimaSmistamento> {
    const stato = await leggiStatoTragitto(db, tragittoId);
    if (!stato) throw new NonTrovato('Tragitto');
    const { carico, senzaPosto } = simula(stato);

    // Lo smistamento del tragitto comincia con la prima partenza tra le
    // prenotazioni confermate (senza prenotazioni: la prima fermata).
    const tempi = stato.prenotazioni.length > 0
      ? stato.prenotazioni.map((p) => calcolaTempi(stato.orari, p.fermataCitta, p.fermataOrario))
      : stato.orari.fermate.length > 0
        ? stato.orari.fermate.map((f) => calcolaTempi(stato.orari, f.citta))
        : [calcolaTempi(stato.orari, null)];
    const inizio = primaPartenza(tempi)?.disponibileDal ?? null;

    return {
      smistamentoIl: inizio ? inizio.toISOString() : null,
      giaSmistato: inizio !== null && Date.now() >= inizio.getTime(),
      linee: stato.linee.map((l) => ({
        lineaId: l.lineaId,
        lineaNome: l.lineaNome,
        bus: l.bus.map((b) => {
          const c = carico.get(b.busId) ?? { passeggeri: 0, prenotazioni: 0, sommaEta: 0, passeggeriConEta: 0 };
          return {
            busId: b.busId,
            riferimento: b.riferimento,
            postiBus: b.postiBus,
            passeggeri: c.passeggeri,
            prenotazioni: c.prenotazioni,
            etaMedia: c.passeggeriConEta > 0 ? Math.round((c.sommaEta / c.passeggeriConEta) * 10) / 10 : null,
          };
        }),
      })),
      senzaPosto: { prenotazioni: senzaPosto.length, passeggeri: senzaPosto.reduce((somma, p) => somma + p.passeggeri, 0) },
    };
  },
};
