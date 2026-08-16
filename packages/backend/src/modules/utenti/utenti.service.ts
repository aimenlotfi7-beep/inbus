import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { utenti, prenotazioni } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';
import type { UpsertUtenteInput } from './utenti.dto.js';

export const utentiService = {
  async list() {
    return db.select().from(utenti).orderBy(utenti.creatoIl);
  },

  async getById(id: string) {
    const [utente] = await db.select().from(utenti).where(eq(utenti.id, id)).limit(1);
    if (!utente) throw new NonTrovato('Utente');
    return utente;
  },

  async storicoPrenotazioni(utenteId: string) {
    return db.select().from(prenotazioni).where(eq(prenotazioni.utenteId, utenteId));
  },

  /** Solo nome/cognome/telefono per il preriempimento al checkout — non
   *  l'oggetto utente completo, per non esporre più dati del necessario
   *  da un endpoint pubblico. */
  async datiPerCheckout(email: string) {
    const [utente] = await db.select().from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!utente) return null;
    return { nome: utente.nome, cognome: utente.cognome, telefono: utente.telefono };
  },

  /** Crea l'utente se l'email non esiste ancora, altrimenti aggiorna i
   *  campi inviati. Chiamato dal checkout, dove il cliente non fa un vero
   *  "signup" ma i suoi dati vengono comunque salvati per il futuro. */
  async upsertByEmail(input: UpsertUtenteInput) {
    const email = input.email.toLowerCase();
    const [esistente] = await db.select().from(utenti).where(eq(utenti.email, email)).limit(1);

    if (esistente) {
      const [aggiornato] = await db
        .update(utenti)
        .set({
          ...(input.nome && { nome: input.nome }),
          ...(input.cognome && { cognome: input.cognome }),
          ...(input.telefono && { telefono: input.telefono }),
          ...(input.codiceFiscale && { codiceFiscale: input.codiceFiscale }),
          ...(input.dataNascita && { dataNascita: input.dataNascita }),
          ...(input.indirizzo && { indirizzo: input.indirizzo }),
          ...(input.citta && { citta: input.citta }),
          ...(input.cap && { cap: input.cap }),
        })
        .where(eq(utenti.id, esistente.id))
        .returning();
      return aggiornato;
    }

    const [nuovo] = await db
      .insert(utenti)
      .values({
        email,
        nome: input.nome,
        cognome: input.cognome,
        telefono: input.telefono,
        codiceFiscale: input.codiceFiscale,
        dataNascita: input.dataNascita,
        indirizzo: input.indirizzo,
        citta: input.citta,
        cap: input.cap,
      })
      .returning();
    return nuovo;
  },
};
