import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  lineeBus,
  fermate,
  immaginiEvento,
  allegatiEvento,
  prenotazioni,
  busFisici,
  busTratte,
} from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { leggiPostiPerBus } from '../impostazioni/impostazioni.routes.js';
import type { CreaEventoInput, AggiornaEventoInput, ListaEventiQuery } from './eventi.dto.js';

// Include standard riusato da list/getById: evento con tutte le sue
// relazioni annidate, così il frontend riceve un unico oggetto completo
// (esattamente come faceva il vecchio inbusLoadDB() nel prototipo).
const includeCompleto = {
  linee: { with: { fermate: true } },
  immagini: true,
  allegati: true,
} as const;

async function getById(id: string) {
  const evento = await db.query.eventi.findFirst({
    where: eq(eventi.id, id),
    with: includeCompleto,
  });
  if (!evento) throw new NonTrovato('Evento');
  return evento;
}

export const eventiService = {
  async list(query: ListaEventiQuery) {
    const condizioni = [];
    if (query.citta) condizioni.push(ilike(eventi.citta, `%${query.citta}%`));
    if (query.genere) condizioni.push(ilike(eventi.genere, `%${query.genere}%`));
    if (query.soloInEvidenza) condizioni.push(eq(eventi.inEvidenza, true));

    return db.query.eventi.findMany({
      where: condizioni.length ? and(...condizioni) : undefined,
      with: includeCompleto,
      orderBy: (e, { asc }) => [asc(e.data)],
    });
  },

  getById,

  async create(input: CreaEventoInput) {
    return db.transaction(async (tx) => {
      const [nuovoEvento] = await tx
        .insert(eventi)
        .values({
          artista: input.artista,
          genere: input.genere,
          luogo: input.luogo,
          citta: input.citta,
          data: input.data,
          prezzo: input.prezzo.toFixed(2),
          inEvidenza: input.inEvidenza,
          ordineEvidenza: input.ordineEvidenza,
          vetrinaDal: input.vetrinaDal,
          vetrinaAl: input.vetrinaAl,
          accontoEur: input.accontoEur?.toFixed(2),
        })
        .returning();

      if (input.immagini.length) {
        await tx.insert(immaginiEvento).values(
          input.immagini.map((url, ordine) => ({ eventoId: nuovoEvento.id, url, ordine }))
        );
      }
      if (input.allegati.length) {
        await tx.insert(allegatiEvento).values(
          input.allegati.map((a) => ({ eventoId: nuovoEvento.id, nome: a.nome, url: a.url }))
        );
      }
      for (const linea of input.linee) {
        const [nuovaLinea] = await tx
          .insert(lineeBus)
          .values({
            eventoId: nuovoEvento.id,
            nome: linea.nome,
            postiTotali: linea.postiTotali,
            postiDisponibili: linea.postiTotali, // alla creazione tutti i posti sono liberi
            prezzoExtra: linea.prezzoExtra.toFixed(2),
            referenteNome: linea.referenteNome,
            referenteTelefono: linea.referenteTelefono,
            fornitoreId: linea.fornitoreId,
          })
          .returning();

        if (linea.fermate.length) {
          await tx.insert(fermate).values(
            linea.fermate.map((f, ordine) => ({
              lineaId: nuovaLinea.id,
              ordine,
              citta: f.citta,
              indirizzo: f.indirizzo,
              orario: f.orario,
              orarioRitorno: f.orarioRitorno,
              indirizzoRitorno: f.indirizzoRitorno,
              prezzo: f.prezzo?.toFixed(2),
            }))
          );
        }
      }

      return nuovoEvento.id;
    });
  },

  async update(id: string, input: AggiornaEventoInput) {
    await getById(id); // lancia NonTrovato se non esiste

    return db.transaction(async (tx) => {
      await tx
        .update(eventi)
        .set({
          ...(input.artista !== undefined && { artista: input.artista }),
          ...(input.genere !== undefined && { genere: input.genere }),
          ...(input.luogo !== undefined && { luogo: input.luogo }),
          ...(input.citta !== undefined && { citta: input.citta }),
          ...(input.data !== undefined && { data: input.data }),
          ...(input.prezzo !== undefined && { prezzo: input.prezzo.toFixed(2) }),
          ...(input.inEvidenza !== undefined && { inEvidenza: input.inEvidenza }),
          ...(input.ordineEvidenza !== undefined && { ordineEvidenza: input.ordineEvidenza }),
          ...(input.vetrinaDal !== undefined && { vetrinaDal: input.vetrinaDal }),
          ...(input.vetrinaAl !== undefined && { vetrinaAl: input.vetrinaAl }),
          ...(input.accontoEur !== undefined && { accontoEur: input.accontoEur.toFixed(2) }),
          aggiornatoIl: new Date(),
        })
        .where(eq(eventi.id, id));

      // Le linee/fermate, se inviate, sostituiscono interamente quelle
      // esistenti (stesso comportamento del prototipo originale): è la
      // via più semplice e prevedibile per un form che invia sempre
      // l'elenco completo, invece di fare un diff granulare.
      if (input.linee) {
        await tx.delete(lineeBus).where(eq(lineeBus.eventoId, id)); // cascade sulle fermate
        for (const linea of input.linee) {
          const [nuovaLinea] = await tx
            .insert(lineeBus)
            .values({
              eventoId: id,
              nome: linea.nome,
              postiTotali: linea.postiTotali,
              postiDisponibili: linea.postiTotali,
              prezzoExtra: linea.prezzoExtra.toFixed(2),
              referenteNome: linea.referenteNome,
              referenteTelefono: linea.referenteTelefono,
              fornitoreId: linea.fornitoreId,
            })
            .returning();

          if (linea.fermate.length) {
            await tx.insert(fermate).values(
              linea.fermate.map((f, ordine) => ({
                lineaId: nuovaLinea.id,
                ordine,
                citta: f.citta,
                indirizzo: f.indirizzo,
                orario: f.orario,
                orarioRitorno: f.orarioRitorno,
                indirizzoRitorno: f.indirizzoRitorno,
                prezzo: f.prezzo?.toFixed(2),
              }))
            );
          }
        }
      }

      return id;
    });
  },

  async remove(id: string) {
    await getById(id);
    const prenotazioniCollegate = await db
      .select({ id: prenotazioni.id })
      .from(prenotazioni)
      .where(eq(prenotazioni.eventoId, id));
    if (prenotazioniCollegate.length > 0) {
      throw new ConflittoDati(
        `Non puoi eliminare questo evento: ci sono ${prenotazioniCollegate.length} prenotazioni collegate (anche cancellate restano nello storico). Cancella prima quelle prenotazioni, se proprio necessario, oppure lascia l'evento così com'è: non comparirà più nelle nuove vendite se ne rimuovi la vetrina/evidenza.`
      );
    }
    await db.delete(eventi).where(eq(eventi.id, id)); // cascade su linee/fermate/immagini/chat/lista attesa/promoter
  },

  /** Somma i posti disponibili su tutte le linee di un evento. */
  postiTotaliDisponibili(evento: Awaited<ReturnType<typeof getById>>) {
    return evento.linee.reduce((somma, l) => somma + l.postiDisponibili, 0);
  },

  /** Una riga per ogni fermata prenotabile, con il prezzo effettivo già
   *  calcolato (sovrascrive prezzo base+extra se la fermata ha un prezzo
   *  proprio) — usata dal checkout sul sito pubblico. */
  async opzioniPartenza(eventoId: string) {
    const evento = await getById(eventoId);
    const opzioni: Array<{
      lineaId: string;
      postiDisponibili: number;
      fermataId: string;
      fermataCitta: string;
      fermataIndirizzo: string;
      fermataOrario: string | null;
      orarioRitorno: string | null;
      indirizzoRitorno: string | null;
      prezzoEffettivo: number;
    }> = [];

    for (const linea of evento.linee) {
      if (linea.postiDisponibili <= 0) continue;
      for (const f of linea.fermate) {
        const prezzoEffettivo = f.prezzo
          ? Number(f.prezzo)
          : Number(evento.prezzo) + Number(linea.prezzoExtra);
        opzioni.push({
          lineaId: linea.id,
          postiDisponibili: linea.postiDisponibili,
          fermataId: f.id,
          fermataCitta: f.citta,
          fermataIndirizzo: f.indirizzo,
          fermataOrario: f.orario,
          orarioRitorno: f.orarioRitorno,
          indirizzoRitorno: f.indirizzoRitorno,
          prezzoEffettivo,
        });
      }
    }
    return opzioni;
  },

  /**
   * Suggerisce quanti bus servono per ogni linea dell'evento, in base ai
   * passeggeri confermati per fermata. Logica (concordata con l'utente):
   * si percorrono le fermate in ordine; se i passeggeri di UNA fermata da
   * soli riempiono (o superano) un bus, quella fermata ottiene bus dedicati
   * partendo direttamente da lì; altrimenti i passeggeri di fermate vicine
   * si accumulano sullo stesso bus finché non si supera la capienza.
   * È un suggerimento, non un instradamento reale: l'orario di partenza
   * di ogni bus resta da compilare a mano (richiederebbe tempi di
   * percorrenza reali tra le città, non disponibili nel gestionale).
   */
  async calcolaBusNecessari(eventoId: string) {
    const evento = await getById(eventoId);
    const capienza = await leggiPostiPerBus();

    const prenotazioniConfermate = await db
      .select({ lineaId: prenotazioni.lineaId, fermataCitta: prenotazioni.fermataCitta, passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));

    return evento.linee.map((linea) => {
      const fermateOrdinate = [...linea.fermate].sort((a, b) => a.ordine - b.ordine);

      const fermateConPasseggeri = fermateOrdinate.map((f) => {
        const passeggeri = prenotazioniConfermate
          .filter((p) => p.lineaId === linea.id && p.fermataCitta === f.citta)
          .reduce((somma, p) => somma + p.passeggeri, 0);
        return { fermataId: f.id, citta: f.citta, passeggeri };
      });

      let busSuggeriti = 0;
      let caricoBusCorrente = 0;
      for (const f of fermateConPasseggeri) {
        if (f.passeggeri >= capienza) {
          // Questa fermata da sola riempie almeno un bus: se c'era un bus
          // "in accumulo" da fermate precedenti, lo chiudo prima.
          if (caricoBusCorrente > 0) { busSuggeriti += 1; caricoBusCorrente = 0; }
          busSuggeriti += Math.floor(f.passeggeri / capienza);
          const resto = f.passeggeri % capienza;
          caricoBusCorrente = resto; // il resto prova ad accumularsi con le prossime fermate
        } else if (caricoBusCorrente + f.passeggeri <= capienza) {
          caricoBusCorrente += f.passeggeri;
        } else {
          busSuggeriti += 1; // il bus in accumulo è pieno, ne apro uno nuovo
          caricoBusCorrente = f.passeggeri;
        }
      }
      if (caricoBusCorrente > 0) busSuggeriti += 1;

      const totalePasseggeri = fermateConPasseggeri.reduce((s, f) => s + f.passeggeri, 0);

      return {
        lineaId: linea.id,
        nome: linea.nome,
        postiTotali: linea.postiTotali,
        capienzaPerBus: capienza,
        fermate: fermateConPasseggeri,
        totalePasseggeri,
        busSuggeriti,
        coperta: linea.coperta,
      };
    });
  },

  /** Segna una linea/tratta come coperta (o no) — sezione Partenze. Non
   *  tocca fermate né altro, per non rischiare di sovrascrivere dati con
   *  l'update "wholesale" dell'evento. */
  async impostaCopertura(eventoId: string, lineaId: string, coperta: boolean, noteCoperta?: string) {
    const [linea] = await db.select().from(lineeBus).where(eq(lineeBus.id, lineaId)).limit(1);
    if (!linea || linea.eventoId !== eventoId) throw new NonTrovato('Linea');
    await db.update(lineeBus).set({ coperta, ...(noteCoperta !== undefined && { noteCoperta }) }).where(eq(lineeBus.id, lineaId));
  },

  /** Bus fisici collegati a una qualunque linea dell'evento, con le tratte
   *  (linee) che ciascuno copre. */
  async listaBus(eventoId: string) {
    const evento = await getById(eventoId);
    const lineeIds = evento.linee.map((l) => l.id);
    if (lineeIds.length === 0) return [];

    const assegnazioni = await db.select().from(busTratte).where(inArray(busTratte.lineaId, lineeIds));
    const busIds = Array.from(new Set(assegnazioni.map((a) => a.busId)));
    if (busIds.length === 0) return [];

    const bus = await db.select().from(busFisici).where(inArray(busFisici.id, busIds));
    return bus.map((b) => ({
      ...b,
      lineeIds: assegnazioni.filter((a) => a.busId === b.id).map((a) => a.lineaId),
    }));
  },

  async creaBus(eventoId: string, input: { fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; note?: string; lineeIds: string[] }) {
    const evento = await getById(eventoId);
    const lineeValide = new Set(evento.linee.map((l) => l.id));
    const lineeIdsFiltrate = input.lineeIds.filter((id) => lineeValide.has(id));
    if (lineeIdsFiltrate.length === 0) throw new ConflittoDati('Seleziona almeno una tratta di questo evento per il bus.');

    return db.transaction(async (tx) => {
      const [nuovo] = await tx.insert(busFisici).values({
        fornitoreId: input.fornitoreId,
        riferimento: input.riferimento,
        autistaNome: input.autistaNome,
        autistaTelefono: input.autistaTelefono,
        note: input.note,
      }).returning();
      await tx.insert(busTratte).values(lineeIdsFiltrate.map((lineaId) => ({ busId: nuovo.id, lineaId })));
      return nuovo.id;
    });
  },

  async aggiornaBus(eventoId: string, busId: string, input: { fornitoreId?: string; riferimento?: string; autistaNome?: string; autistaTelefono?: string; note?: string; lineeIds?: string[] }) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');

    return db.transaction(async (tx) => {
      if (input.riferimento !== undefined || input.fornitoreId !== undefined || input.autistaNome !== undefined || input.autistaTelefono !== undefined || input.note !== undefined) {
        await tx.update(busFisici).set({
          ...(input.riferimento !== undefined && { riferimento: input.riferimento }),
          ...(input.fornitoreId !== undefined && { fornitoreId: input.fornitoreId }),
          ...(input.autistaNome !== undefined && { autistaNome: input.autistaNome }),
          ...(input.autistaTelefono !== undefined && { autistaTelefono: input.autistaTelefono }),
          ...(input.note !== undefined && { note: input.note }),
        }).where(eq(busFisici.id, busId));
      }
      if (input.lineeIds !== undefined) {
        const evento = await getById(eventoId);
        const lineeValide = new Set(evento.linee.map((l) => l.id));
        const lineeIdsFiltrate = input.lineeIds.filter((id) => lineeValide.has(id));
        await tx.delete(busTratte).where(eq(busTratte.busId, busId));
        if (lineeIdsFiltrate.length > 0) {
          await tx.insert(busTratte).values(lineeIdsFiltrate.map((lineaId) => ({ busId, lineaId })));
        }
      }
    });
  },

  async rimuoviBus(busId: string) {
    const [bus] = await db.select().from(busFisici).where(eq(busFisici.id, busId)).limit(1);
    if (!bus) throw new NonTrovato('Bus');
    await db.delete(busFisici).where(eq(busFisici.id, busId)); // cascade su bus_tratte
  },

  /** Conta quante tratte, in tutti gli eventi, hanno più passeggeri
   *  confermati dei posti totali previsti — usato per il pallino di
   *  notifica sulla voce "Partenze" nel menu del gestionale. */
  async contaAllertePartenze() {
    const righe = await db
      .select({ lineaId: lineeBus.id, postiTotali: lineeBus.postiTotali })
      .from(lineeBus);

    const somme = await db
      .select({ lineaId: prenotazioni.lineaId, totale: sql<number>`sum(${prenotazioni.passeggeri})` })
      .from(prenotazioni)
      .where(eq(prenotazioni.stato, 'CONFERMATA'))
      .groupBy(prenotazioni.lineaId);

    const mappaPasseggeri = new Map(somme.map((s) => [s.lineaId, Number(s.totale)]));
    let conteggio = 0;
    for (const r of righe) {
      const passeggeri = mappaPasseggeri.get(r.lineaId) ?? 0;
      if (passeggeri > r.postiTotali) conteggio++;
    }
    return conteggio;
  },
};
