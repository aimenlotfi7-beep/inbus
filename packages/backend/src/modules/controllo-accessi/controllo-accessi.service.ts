import { eq, inArray, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, linee, lineaFermate, fermate, tragitti, eventi, prenotazioni, partecipantiPrenotazione } from '../../db/schema.js';
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

/** Cosa copre davvero questo bus — il tragitto E le fermate specifiche
 *  (via la sua Linea), non più l'intero tragitto come col vecchio
 *  sistema. Un bus può condividere il tragitto con un ALTRO bus (Linee
 *  diverse dello stesso tragitto, es. una per le fermate del nord e
 *  una per quelle del sud) — controllare solo il tragitto avrebbe
 *  lasciato salire un passeggero sul bus sbagliato. */
async function coperturaDelBus(busId: string): Promise<{ tragittoId: string; fermateCitta: string[] } | null> {
  const [bus] = await db.select({ lineaId: busFisici.lineaId }).from(busFisici).where(eq(busFisici.id, busId)).limit(1);
  if (!bus?.lineaId) return null;
  const [lineaVera] = await db.select().from(linee).where(eq(linee.id, bus.lineaId)).limit(1);
  if (!lineaVera) return null;
  const righeFermate = await db.select({ citta: fermate.citta }).from(lineaFermate)
    .innerJoin(fermate, eq(fermate.id, lineaFermate.fermataId))
    .where(eq(lineaFermate.lineaId, bus.lineaId));
  return { tragittoId: lineaVera.tragittoId, fermateCitta: righeFermate.map((f) => f.citta) };
}

/** Stessa cosa di coperturaDelBus, ma per TUTTI i bus di un tour
 *  leader insieme — usata dove serve cercare/validare senza sapere a
 *  priori su quale bus specifico (ricerca manuale, check-in manuale). */
async function coperturaCompleta(tourLeaderId: string): Promise<Set<string>> {
  const busIds = (await db.select({ id: busFisici.id }).from(busFisici).where(eq(busFisici.tourLeaderId, tourLeaderId))).map((b) => b.id);
  const chiavi = new Set<string>();
  for (const busId of busIds) {
    const copertura = await coperturaDelBus(busId);
    if (!copertura) continue;
    for (const citta of copertura.fermateCitta) chiavi.add(`${copertura.tragittoId}::${citta}`);
  }
  return chiavi;
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

  /** Contatore in tempo reale: quanti passeggeri attesi su questo bus,
   *  quanti sono già saliti (scansionati almeno una volta). */
  async statoBus(busId: string, tourLeaderId: string) {
    const bus = await verificaProprietaBus(busId, tourLeaderId);
    const copertura = await coperturaDelBus(busId);
    if (!copertura || copertura.fermateCitta.length === 0) return { riferimento: bus.riferimento, totale: 0, saliti: 0 };

    const prenotazioniBus = await db
      .select({ id: prenotazioni.id })
      .from(prenotazioni)
      .where(and(
        eq(prenotazioni.tragittoId, copertura.tragittoId),
        inArray(prenotazioni.fermataCitta, copertura.fermateCitta),
        eq(prenotazioni.stato, 'CONFERMATA'),
      ));
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
    const copertura = await coperturaDelBus(busId);

    const [partecipante] = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.ticketToken, token))
      .limit(1);
    if (!partecipante) return { esito: 'non_valido' };

    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    if (!pren || pren.stato !== 'CONFERMATA') return { esito: 'non_valido' };
    // Deve combaciare sia il tragitto SIA la fermata specifica — un
    // passeggero di una fermata coperta da un'ALTRA Linea dello stesso
    // tragitto non sale su questo bus.
    if (!copertura || pren.tragittoId !== copertura.tragittoId || !copertura.fermateCitta.includes(pren.fermataCitta)) {
      return { esito: 'bus_sbagliato' };
    }

    const nome = `${partecipante.nome} ${partecipante.cognome}`;

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

  /** Cerca un passeggero per nome, cognome, PNR o email — su tutte le
   *  tratte assegnate a questo tour leader, non solo un bus alla volta.
   *  Serve per il check-in manuale quando il QR non si legge o il
   *  cliente non ce l'ha a portata di mano. */
  async cerca(tourLeaderId: string, query: string) {
    const chiaviCoperte = await coperturaCompleta(tourLeaderId);
    if (chiaviCoperte.size === 0 || query.trim().length < 2) return [];
    const tragittiIds = [...new Set([...chiaviCoperte].map((c) => c.split('::')[0]))];

    const prenotazioniAssegnate = (await db
      .select()
      .from(prenotazioni)
      .where(and(inArray(prenotazioni.tragittoId, tragittiIds), eq(prenotazioni.stato, 'CONFERMATA'))))
      .filter((p) => chiaviCoperte.has(`${p.tragittoId}::${p.fermataCitta}`));
    if (!prenotazioniAssegnate.length) return [];

    const prenotazioniPerId = new Map(prenotazioniAssegnate.map((p) => [p.id, p]));
    const partecipantiRighe = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(inArray(partecipantiPrenotazione.prenotazioneId, Array.from(prenotazioniPerId.keys())));

    const q = query.trim().toLowerCase();
    return partecipantiRighe
      .filter((p) => {
        const pren = prenotazioniPerId.get(p.prenotazioneId)!;
        return `${p.nome} ${p.cognome} ${pren.pnr}`.toLowerCase().includes(q);
      })
      .map((p) => {
        const pren = prenotazioniPerId.get(p.prenotazioneId)!;
        return {
          partecipanteId: p.id,
          nome: p.nome,
          cognome: p.cognome,
          pnr: pren.pnr,
          fermataCitta: pren.fermataCitta,
          giaSalito: !!p.ticketUtilizzatoIl,
        };
      })
      .slice(0, 20);
  },

  /** Check-in manuale — stesso identico effetto della scansione QR, ma
   *  scelto dalla lista di ricerca invece che leggendo il codice. */
  async checkinManuale(tourLeaderId: string, partecipanteId: string) {
    const [partecipante] = await db.select().from(partecipantiPrenotazione).where(eq(partecipantiPrenotazione.id, partecipanteId)).limit(1);
    if (!partecipante) throw new NonTrovato('Passeggero');
    const [pren] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, partecipante.prenotazioneId)).limit(1);
    if (!pren) throw new NonTrovato('Prenotazione');

    const chiaviCoperte = await coperturaCompleta(tourLeaderId);
    if (!chiaviCoperte.has(`${pren.tragittoId}::${pren.fermataCitta}`)) {
      throw new VietatoDaiPermessi('Questo passeggero non è su una tua tratta.');
    }

    // Stesso motivo del controllo atomico in scansiona() qui sopra —
    // anche se qui il danno pratico di una doppia corsa è minore (non
    // cambia la risposta), resta comunque scorretto lasciare che due
    // richieste quasi simultanee sovrascrivano lo stesso orario due
    // volte invece di una.
    await db.update(partecipantiPrenotazione)
      .set({ ticketUtilizzatoIl: new Date() })
      .where(and(eq(partecipantiPrenotazione.id, partecipanteId), isNull(partecipantiPrenotazione.ticketUtilizzatoIl)));
    return { nome: `${partecipante.nome} ${partecipante.cognome}` };
  },
};
