import { eq, inArray, and, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, busTratte, lineeBus, eventi, prenotazioni, partecipantiPrenotazione } from '../../db/schema.js';
import { NonTrovato, VietatoDaiPermessi } from '../../shared/errors.js';

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

/** Id delle tratte (linee) assegnate a questo bus — i passeggeri di
 *  QUESTE tratte sono quelli che il tour leader deve controllare. */
async function tratteDelBus(busId: string): Promise<string[]> {
  const righe = await db.select({ lineaId: busTratte.lineaId }).from(busTratte).where(eq(busTratte.busId, busId));
  return righe.map((r) => r.lineaId);
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
      .innerJoin(busTratte, eq(busTratte.busId, busFisici.id))
      .innerJoin(lineeBus, eq(lineeBus.id, busTratte.lineaId))
      .innerJoin(eventi, eq(eventi.id, lineeBus.eventoId))
      .where(eq(busFisici.tourLeaderId, tourLeaderId));

    // Un bus può avere più tratte (quindi più righe qui) — le riduco a
    // una voce sola per bus.
    const perBus = new Map<string, typeof righe[number]>();
    for (const r of righe) perBus.set(r.busId, r);
    return Array.from(perBus.values()).sort((a, b) => +new Date(a.eventoData) - +new Date(b.eventoData));
  },

  /** Contatore in tempo reale: quanti passeggeri attesi su questo bus,
   *  quanti sono già saliti (scansionati almeno una volta). */
  async statoBus(busId: string, tourLeaderId: string) {
    const bus = await verificaProprietaBus(busId, tourLeaderId);
    const lineeIds = await tratteDelBus(busId);
    if (lineeIds.length === 0) return { riferimento: bus.riferimento, totale: 0, saliti: 0 };

    const prenotazioniBus = await db
      .select({ id: prenotazioni.id })
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.lineaId, lineeIds), eq(prenotazioni.stato, 'CONFERMATA')));
    const prenotazioniIds = prenotazioniBus.map((p) => p.id);
    if (prenotazioniIds.length === 0) return { riferimento: bus.riferimento, totale: 0, saliti: 0 };

    const [{ totale }] = await db
      .select({ totale: sql<number>`count(*)::int` })
      .from(partecipantiPrenotazione)
      .where(inArray(partecipantiPrenotazione.prenotazioneId, prenotazioniIds));
    const [{ saliti }] = await db
      .select({ saliti: sql<number>`count(*)::int` })
      .from(partecipantiPrenotazione)
      .where(and(
        inArray(partecipantiPrenotazione.prenotazioneId, prenotazioniIds),
        sql`${partecipantiPrenotazione.ticketUtilizzatoIl} is not null`,
      ));

    return { riferimento: bus.riferimento, totale, saliti };
  },

  /** Scansiona un QR — restituisce sempre un esito chiaro, mai un
   *  errore HTTP "secco": è pensata per essere usata in movimento, sul
   *  bus, dove serve un feedback immediato e leggibile a schermo. */
  async scansiona(busId: string, tourLeaderId: string, token: string): Promise<
    | { esito: 'valido'; nome: string }
    | { esito: 'gia_a_bordo'; nome: string }
    | { esito: 'bus_sbagliato' }
    | { esito: 'non_valido' }
  > {
    await verificaProprietaBus(busId, tourLeaderId);
    const lineeIds = await tratteDelBus(busId);

    const [partecipante] = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.ticketToken, token))
      .limit(1);
    if (!partecipante) return { esito: 'non_valido' };

    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    if (!pren || pren.stato !== 'CONFERMATA') return { esito: 'non_valido' };
    if (!lineeIds.includes(pren.lineaId)) return { esito: 'bus_sbagliato' };

    const nome = `${partecipante.nome} ${partecipante.cognome}`;
    if (partecipante.ticketUtilizzatoIl) return { esito: 'gia_a_bordo', nome };

    await db.update(partecipantiPrenotazione).set({ ticketUtilizzatoIl: new Date() }).where(eq(partecipantiPrenotazione.id, partecipante.id));
    return { esito: 'valido', nome };
  },
};
