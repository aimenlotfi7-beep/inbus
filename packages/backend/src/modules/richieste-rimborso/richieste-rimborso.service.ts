import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { richiesteRimborso, prenotazioni, utenti, eventi } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { creditoService } from '../credito/credito.service.js';

export const richiesteRimborsoService = {
  /** Solo il numero, non l'elenco completo — usata per il pallino di
   *  avviso nel menu laterale (caricato su ogni pagina del gestionale,
   *  deve restare leggera). */
  async contaInAttesa() {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(richiesteRimborso).where(eq(richiesteRimborso.stato, 'IN_ATTESA'));
    return n;
  },

  /** Il cliente invia la richiesta — non verifichiamo una vera identità
   *  (non c'è ancora un account con password), solo che l'email
   *  combaci con quella della prenotazione: stesso livello di sicurezza
   *  già usato altrove nel checkout/area cliente. */
  async richiedi(pnr: string, email: string, motivo?: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato === 'CANCELLATA') throw new ConflittoDati('Questa prenotazione è già cancellata.');

    const [u] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (!u || u.email.toLowerCase() !== email.toLowerCase()) throw new ConflittoDati('Email non corrispondente a questa prenotazione.');

    const [esistente] = await db.select().from(richiesteRimborso)
      .where(eq(richiesteRimborso.prenotazioneId, p.id));
    if (esistente?.stato === 'IN_ATTESA') throw new ConflittoDati('C\'è già una richiesta di rimborso in attesa per questa prenotazione.');

    const [nuova] = await db.insert(richiesteRimborso).values({ prenotazioneId: p.id, motivo }).returning();
    return nuova;
  },

  async list() {
    return db
      .select({
        id: richiesteRimborso.id,
        stato: richiesteRimborso.stato,
        motivo: richiesteRimborso.motivo,
        noteAdmin: richiesteRimborso.noteAdmin,
        richiestaIl: richiesteRimborso.richiestaIl,
        gestitaIl: richiesteRimborso.gestitaIl,
        pnr: prenotazioni.pnr,
        prenotazioneTotale: prenotazioni.totale,
        eventoArtista: eventi.artista,
        eventoCategoria: eventi.categoria,
        eventoData: eventi.data,
        clienteEmail: utenti.email,
        clienteNome: utenti.nome,
        clienteCognome: utenti.cognome,
      })
      .from(richiesteRimborso)
      .innerJoin(prenotazioni, eq(prenotazioni.id, richiesteRimborso.prenotazioneId))
      .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
      .innerJoin(eventi, eq(eventi.id, prenotazioni.eventoId))
      .orderBy(desc(richiesteRimborso.richiestaIl));
  },

  /** Approva: cancella per davvero la prenotazione (posti restituiti) e
   *  toglie l'eventuale credito fedeltà già maturato da quel viaggio. */
  async approva(id: string, noteAdmin?: string) {
    const [r] = await db.select().from(richiesteRimborso).where(eq(richiesteRimborso.id, id)).limit(1);
    if (!r) throw new NonTrovato('Richiesta');
    if (r.stato !== 'IN_ATTESA') throw new ConflittoDati('Questa richiesta è già stata gestita.');

    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.id, r.prenotazioneId)).limit(1);
    if (p) {
      await prenotazioniService.cancella(p.pnr);
      await creditoService.revocaCreditoSePresente(p.id);
    }

    await db.update(richiesteRimborso).set({ stato: 'APPROVATA', noteAdmin, gestitaIl: new Date() }).where(eq(richiesteRimborso.id, id));
  },

  async rifiuta(id: string, noteAdmin?: string) {
    const [r] = await db.select().from(richiesteRimborso).where(eq(richiesteRimborso.id, id)).limit(1);
    if (!r) throw new NonTrovato('Richiesta');
    if (r.stato !== 'IN_ATTESA') throw new ConflittoDati('Questa richiesta è già stata gestita.');

    await db.update(richiesteRimborso).set({ stato: 'RIFIUTATA', noteAdmin, gestitaIl: new Date() }).where(eq(richiesteRimborso.id, id));
  },
};
