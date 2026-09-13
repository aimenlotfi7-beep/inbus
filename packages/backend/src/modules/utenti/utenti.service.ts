import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { utenti, prenotazioni, eventi } from '../../db/schema.js';
import { NonTrovato } from '../../shared/errors.js';

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
   *  marketing, consenso profilazione), dall'area personale con l'account. */
  async preferenzePrivacy(utenteId: string) {
    const utente = await this.getById(utenteId);
    return {
      presaVisioneInformativa: utente.presaVisioneInformativa,
      consensoMarketing: utente.consensoMarketing,
      consensoProfilazione: utente.consensoProfilazione,
    };
  },

  /** Aggiorna le preferenze privacy — solo i campi passati (undefined =
   *  lascia invariato), ognuno con la propria data di quando è stata
   *  fatta la scelta, così è dimostrabile in caso di controllo. */
  async aggiornaPreferenzePrivacy(utenteId: string, input: { presaVisioneInformativa?: boolean; consensoMarketing?: boolean; consensoProfilazione?: boolean }) {
    const adesso = new Date();
    const valori = {
      ...(input.presaVisioneInformativa !== undefined && { presaVisioneInformativa: input.presaVisioneInformativa, presaVisioneInformativaData: adesso }),
      ...(input.consensoMarketing !== undefined && { consensoMarketing: input.consensoMarketing, consensoMarketingData: adesso }),
      ...(input.consensoProfilazione !== undefined && { consensoProfilazione: input.consensoProfilazione, consensoProfilazioneData: adesso }),
    };
    if (Object.keys(valori).length > 0) await db.update(utenti).set(valori).where(eq(utenti.id, utenteId));
    return this.preferenzePrivacy(utenteId);
  },
};
