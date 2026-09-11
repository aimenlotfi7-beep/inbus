import { eq, inArray, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, linee, tragitti, eventi, prenotazioni, partecipantiPrenotazione } from '../../db/schema.js';
import { ConflittoDati, NonTrovato, VietatoDaiPermessi } from '../../shared/errors.js';
import { formattaData, formattaOra } from '../../shared/formato.js';
import { tempiBus } from '../prenotazioni/partenza.js';
import { generaPdfPasseggeriBus, leggiSchedaBus, passeggeriDelBus, type PasseggeroBus } from '../eventi/passeggeri-bus.service.js';

/** Verifica che il bus appartenga davvero a questo tour leader — ogni
 *  funzione qui sotto la richiama per prima cosa, così un tour leader
 *  non può mai vedere/scansionare i passeggeri di un bus che non è il
 *  suo (anche solo indovinando l'id nell'indirizzo). */
async function verificaProprietaBus(busId: string, tourLeaderId: string) {
  const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
  if (!bus) throw new NonTrovato('Bus');
  if (bus.tourLeaderId !== tourLeaderId) throw new VietatoDaiPermessi('Questo bus non ti è assegnato.');
  return bus;
}

/** I bus di questo tour leader, con il tragitto della loro linea. */
async function busDelTourLeader(tourLeaderId: string) {
  return db.select({ id: busFisici.id, riferimento: busFisici.riferimento, tragittoId: linee.tragittoId }).from(busFisici)
    .innerJoin(linee, eq(linee.id, busFisici.lineaId))
    .where(eq(busFisici.tourLeaderId, tourLeaderId));
}

/** Riferimento (targa) di ogni bus indicato. */
async function riferimentiBus(busIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(busIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const righe = await db.select({ id: busFisici.id, riferimento: busFisici.riferimento }).from(busFisici).where(inArray(busFisici.id, ids));
  return new Map(righe.map((r) => [r.id, r.riferimento]));
}

/** Per un passeggero che non è su questo bus: dice qual è quello giusto. */
function messaggioBusSbagliato(nome: string, busGiusto: string | null): string {
  return busGiusto ? `${nome} viaggia sul bus ${busGiusto}, non su questo.` : `${nome} non è ancora assegnato a nessun bus.`;
}

/** La lista del bus si vede da 24 ore prima della sua partenza (la prima
 *  fermata della linea, ora di Roma): prima lo smistamento non è avvenuto. */
async function disponibilitaLista(busId: string) {
  const tempi = await tempiBus(busId);
  const disponibileDal = tempi?.disponibileDal ?? null;
  return { disponibile: disponibileDal !== null && Date.now() >= disponibileDal.getTime(), disponibileDal };
}

export const controlloAccessiService = {
  /** Bus assegnati a questo tour leader — su più eventi anche
   *  contemporaneamente, mostra sempre tutto (l'app di scansione serve
   *  anche a distanza di mesi da un evento all'altro). */
  async busAssegnati(tourLeaderId: string) {
    const righe = await db
      .select({
        busId: busFisici.id,
        riferimento: busFisici.riferimento,
        eventoId: eventi.id,
        eventoArtista: eventi.artista,
        eventoData: eventi.data,
      })
      .from(busFisici)
      .innerJoin(linee, eq(linee.id, busFisici.lineaId))
      .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId))
      .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
      .where(eq(busFisici.tourLeaderId, tourLeaderId));

    return righe.sort((a, b) => +new Date(a.eventoData) - +new Date(b.eventoData));
  },

  /** Contatore in tempo reale: quanti passeggeri sono assegnati a questo
   *  bus dallo smistamento, quanti sono già saliti. */
  async statoBus(busId: string, tourLeaderId: string) {
    const bus = await verificaProprietaBus(busId, tourLeaderId);
    const [conteggio] = await db
      .select({
        totale: sql<number>`count(*)::int`,
        saliti: sql<number>`count(${partecipantiPrenotazione.ticketUtilizzatoIl})::int`,
      })
      .from(partecipantiPrenotazione)
      .innerJoin(prenotazioni, eq(prenotazioni.id, partecipantiPrenotazione.prenotazioneId))
      .where(and(eq(prenotazioni.busId, busId), eq(prenotazioni.stato, 'CONFERMATA')));
    return { riferimento: bus.riferimento, totale: conteggio?.totale ?? 0, saliti: conteggio?.saliti ?? 0 };
  },

  /** Scansiona un QR — restituisce sempre un esito chiaro, mai un
   *  errore HTTP "secco": è pensata per essere usata in movimento, sul
   *  bus, dove serve un feedback immediato e leggibile a schermo. Valido
   *  solo se la prenotazione è assegnata a QUESTO bus. */
  async scansiona(busId: string, tourLeaderId: string, token: string): Promise<
    | { esito: 'valido'; nome: string }
    | { esito: 'gia_a_bordo'; nome: string }
    | { esito: 'bus_sbagliato'; nome: string; busGiusto: string | null; messaggio: string }
    | { esito: 'non_valido' }
  > {
    await verificaProprietaBus(busId, tourLeaderId);

    const [partecipante] = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.ticketToken, token))
      .limit(1);
    if (!partecipante) return { esito: 'non_valido' };

    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    if (!pren || pren.stato !== 'CONFERMATA') return { esito: 'non_valido' };

    const nome = `${partecipante.nome} ${partecipante.cognome}`;
    if (pren.busId !== busId) {
      const busGiusto = pren.busId ? (await riferimentiBus([pren.busId])).get(pren.busId) ?? null : null;
      return { esito: 'bus_sbagliato', nome, busGiusto, messaggio: messaggioBusSbagliato(nome, busGiusto) };
    }

    // Atomico: la condizione "non ancora usato" si riverifica proprio
    // nel comando che lo segna usato — due scansioni quasi simultanee
    // dello stesso QR (due dispositivi, o un doppio tap), solo una
    // riesce, l'altra vede l'elenco vuoto e capisce che è già stato
    // validato un istante fa (mostra "già a bordo", non "valido" una
    // seconda volta).
    const [aggiornato] = await db.update(partecipantiPrenotazione)
      .set({ ticketUtilizzatoIl: new Date() })
      .where(and(eq(partecipantiPrenotazione.id, partecipante.id), isNull(partecipantiPrenotazione.ticketUtilizzatoIl)))
      .returning();
    if (!aggiornato) return { esito: 'gia_a_bordo', nome };
    return { esito: 'valido', nome };
  },

  /** Cerca un passeggero per nome, cognome o PNR sui tragitti dei bus di
   *  questo tour leader. Ogni risultato dice su quale bus viaggia e se il
   *  check-in è valido: sul bus indicato (busId) oppure, senza busId, su
   *  uno dei suoi bus. Serve per il check-in manuale quando il QR non si
   *  legge o il cliente non ce l'ha a portata di mano. */
  async cerca(tourLeaderId: string, query: string, busId?: string) {
    const mieiBus = await busDelTourLeader(tourLeaderId);
    if (busId && !mieiBus.some((b) => b.id === busId)) throw new VietatoDaiPermessi('Questo bus non ti è assegnato.');
    const q = query.trim().toLowerCase();
    if (mieiBus.length === 0 || q.length < 2) return [];
    const tragittiIds = [...new Set(mieiBus.map((b) => b.tragittoId))];
    const mieiBusIds = new Set(mieiBus.map((b) => b.id));

    const prenotazioniTragitti = await db
      .select()
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA')));
    if (!prenotazioniTragitti.length) return [];

    const prenotazioniPerId = new Map(prenotazioniTragitti.map((p) => [p.id, p]));
    const partecipantiRighe = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(inArray(partecipantiPrenotazione.prenotazioneId, Array.from(prenotazioniPerId.keys())));

    const trovati = partecipantiRighe
      .filter((p) => `${p.nome} ${p.cognome} ${prenotazioniPerId.get(p.prenotazioneId)!.pnr}`.toLowerCase().includes(q))
      .slice(0, 20);
    const riferimenti = await riferimentiBus(trovati.map((p) => prenotazioniPerId.get(p.prenotazioneId)!.busId));

    return trovati.map((p) => {
      const pren = prenotazioniPerId.get(p.prenotazioneId)!;
      const bus = pren.busId ? riferimenti.get(pren.busId) ?? null : null;
      const valido = busId ? pren.busId === busId : pren.busId !== null && mieiBusIds.has(pren.busId);
      const nome = `${p.nome} ${p.cognome}`;
      let messaggio: string | null = null;
      if (!valido) {
        if (!pren.busId) messaggio = `${nome} non è ancora assegnato a nessun bus.`;
        else if (mieiBusIds.has(pren.busId)) messaggio = `${nome} viaggia sul tuo bus ${bus}, non su questo.`;
        else messaggio = `${nome} viaggia sul bus ${bus}, che non è assegnato a te.`;
      }
      return {
        partecipanteId: p.id,
        nome: p.nome,
        cognome: p.cognome,
        pnr: pren.pnr,
        fermataCitta: pren.fermataCitta,
        giaSalito: !!p.ticketUtilizzatoIl,
        busId: pren.busId,
        bus,
        valido,
        messaggio,
      };
    });
  },

  /** Check-in manuale — stesso identico effetto della scansione QR, ma
   *  scelto dalla lista di ricerca. Con busId: valido solo su quel bus;
   *  senza: solo su uno dei bus di questo tour leader. */
  async checkinManuale(tourLeaderId: string, partecipanteId: string, busId?: string) {
    const [partecipante] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.id, partecipanteId)).limit(1);
    if (!partecipante) throw new NonTrovato('Passeggero');
    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    if (!pren) throw new NonTrovato('Prenotazione');
    if (pren.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione è stata cancellata: il biglietto non è valido.');

    const nome = `${partecipante.nome} ${partecipante.cognome}`;
    const busGiusto = pren.busId ? (await riferimentiBus([pren.busId])).get(pren.busId) ?? null : null;
    if (busId) {
      await verificaProprietaBus(busId, tourLeaderId);
      if (pren.busId !== busId) throw new VietatoDaiPermessi(messaggioBusSbagliato(nome, busGiusto));
    } else {
      const mieiBus = await busDelTourLeader(tourLeaderId);
      if (!pren.busId || !mieiBus.some((b) => b.id === pren.busId)) {
        throw new VietatoDaiPermessi(busGiusto ? `${nome} viaggia sul bus ${busGiusto}, che non è assegnato a te.` : `${nome} non è ancora assegnato a nessun bus.`);
      }
    }

    // Stesso motivo del controllo atomico in scansiona(): due richieste
    // quasi simultanee non sovrascrivono l'orario di salita due volte.
    await db.update(partecipantiPrenotazione)
      .set({ ticketUtilizzatoIl: new Date() })
      .where(and(eq(partecipantiPrenotazione.id, partecipanteId), isNull(partecipantiPrenotazione.ticketUtilizzatoIl)));
    return { nome };
  },

  /** La lista dei passeggeri del bus, da 24 ore prima della partenza; prima
   *  disponibile: false e lista vuota. */
  async listaPasseggeri(busId: string, tourLeaderId: string): Promise<{ disponibile: boolean; disponibileDal: string | null; passeggeri: PasseggeroBus[] }> {
    await verificaProprietaBus(busId, tourLeaderId);
    const { disponibile, disponibileDal } = await disponibilitaLista(busId);
    const dal = disponibileDal ? disponibileDal.toISOString() : null;
    if (!disponibile) return { disponibile: false, disponibileDal: dal, passeggeri: [] };
    const scheda = await leggiSchedaBus(busId);
    if (!scheda) throw new NonTrovato('Bus');
    return { disponibile: true, disponibileDal: dal, passeggeri: await passeggeriDelBus(busId, scheda.tragittoId) };
  },

  /** Segna (o toglie) la salita dalla lista: lo stesso dato della
   *  scansione del QR e del check-in manuale. 403 se il passeggero non è
   *  di questo bus. */
  async segnaSalito(busId: string, tourLeaderId: string, partecipanteId: string, salito: boolean): Promise<{ salito: boolean }> {
    await verificaProprietaBus(busId, tourLeaderId);
    const [partecipante] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.id, partecipanteId)).limit(1);
    if (!partecipante) throw new NonTrovato('Passeggero');
    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    const nome = `${partecipante.nome} ${partecipante.cognome}`;
    if (!pren || pren.stato !== 'CONFERMATA') throw new VietatoDaiPermessi(`${nome} non è su questo bus: la prenotazione non è più valida.`);
    if (pren.busId !== busId) {
      const busGiusto = pren.busId ? (await riferimentiBus([pren.busId])).get(pren.busId) ?? null : null;
      throw new VietatoDaiPermessi(messaggioBusSbagliato(nome, busGiusto));
    }

    if (salito) {
      // Se era già segnato resta l'orario della prima salita.
      await db.update(partecipantiPrenotazione)
        .set({ ticketUtilizzatoIl: new Date() })
        .where(and(eq(partecipantiPrenotazione.id, partecipanteId), isNull(partecipantiPrenotazione.ticketUtilizzatoIl)));
    } else {
      await db.update(partecipantiPrenotazione)
        .set({ ticketUtilizzatoIl: null })
        .where(eq(partecipantiPrenotazione.id, partecipanteId));
    }
    return { salito };
  },

  /** Il PDF della lista (lo stesso del gestionale), con la stessa regola
   *  delle 24 ore della lista. */
  async pdfPasseggeri(busId: string, tourLeaderId: string) {
    await verificaProprietaBus(busId, tourLeaderId);
    const { disponibile, disponibileDal } = await disponibilitaLista(busId);
    if (!disponibile) {
      throw new ConflittoDati(disponibileDal
        ? `La lista passeggeri sarà disponibile dal ${formattaData(disponibileDal)} alle ${formattaOra(disponibileDal)}, dopo lo smistamento sui bus.`
        : 'La lista passeggeri sarà disponibile il giorno prima della partenza, dopo lo smistamento sui bus.');
    }
    return generaPdfPasseggeriBus(busId);
  },
};
