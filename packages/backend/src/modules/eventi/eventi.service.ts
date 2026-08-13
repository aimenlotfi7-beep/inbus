import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  eventi,
  lineeBus,
  fermate,
  immaginiEvento,
  allegatiEvento,
} from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
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
    await db.delete(eventi).where(eq(eventi.id, id)); // cascade su tutto il resto
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
};
