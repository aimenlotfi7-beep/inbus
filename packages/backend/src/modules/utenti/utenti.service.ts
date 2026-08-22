import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { utenti, prenotazioni, eventi } from '../../db/schema.js';
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
    return db
      .select({
        id: prenotazioni.id,
        pnr: prenotazioni.pnr,
        passeggeri: prenotazioni.passeggeri,
        totale: prenotazioni.totale,
        stato: prenotazioni.stato,
        tipoPagamento: prenotazioni.tipoPagamento,
        saldoPagato: prenotazioni.saldoPagato,
        creataIl: prenotazioni.creataIl,
        artista: eventi.artista,
        dataEvento: eventi.data,
      })
      .from(prenotazioni)
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .where(eq(prenotazioni.utenteId, utenteId))
      .orderBy(desc(prenotazioni.creataIl));
  },

  /** Preferenze privacy del cliente (presa visione informativa, consenso
   *  marketing, consenso profilazione) — accesso pubblico via email,
   *  stesso principio già usato per il resto dell'area cliente (nessuna
   *  vera password oggi). Se il cliente non esiste ancora, torna tutto
   *  "non ancora scelto" invece di un errore: capita se apre questa
   *  pagina prima di aver mai prenotato qualcosa. */
  async preferenzePrivacy(email: string) {
    const [utente] = await db.select().from(utenti).where(eq(utenti.email, email.toLowerCase())).limit(1);
    if (!utente) {
      return { presaVisioneInformativa: null, consensoMarketing: null, consensoProfilazione: null };
    }
    return {
      presaVisioneInformativa: utente.presaVisioneInformativa,
      consensoMarketing: utente.consensoMarketing,
      consensoProfilazione: utente.consensoProfilazione,
    };
  },

  /** Aggiorna le preferenze privacy — solo i campi passati (undefined =
   *  lascia invariato), ognuno con la propria data di quando è stata
   *  fatta la scelta, così è dimostrabile in caso di controllo. Se il
   *  cliente non esiste ancora (mai prenotato), lo crea al volo con solo
   *  l'email — capita se qualcuno visita questa pagina prima di aver mai
   *  prenotato. */
  async aggiornaPreferenzePrivacy(email: string, input: { presaVisioneInformativa?: boolean; consensoMarketing?: boolean; consensoProfilazione?: boolean }) {
    const emailNormalizzata = email.toLowerCase();
    const [esistente] = await db.select().from(utenti).where(eq(utenti.email, emailNormalizzata)).limit(1);
    const adesso = new Date();

    const valori = {
      ...(input.presaVisioneInformativa !== undefined && { presaVisioneInformativa: input.presaVisioneInformativa, presaVisioneInformativaData: adesso }),
      ...(input.consensoMarketing !== undefined && { consensoMarketing: input.consensoMarketing, consensoMarketingData: adesso }),
      ...(input.consensoProfilazione !== undefined && { consensoProfilazione: input.consensoProfilazione, consensoProfilazioneData: adesso }),
    };

    if (esistente) {
      await db.update(utenti).set(valori).where(eq(utenti.id, esistente.id));
    } else {
      await db.insert(utenti).values({ email: emailNormalizzata, ...valori });
    }
    return this.preferenzePrivacy(emailNormalizzata);
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
