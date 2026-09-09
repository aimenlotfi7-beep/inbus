import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { richiesteRimborso, prenotazioni, utenti, eventi, ordini } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { creditoService } from '../credito/credito.service.js';
import { inviaEventoMetaSeConfigurato } from '../prenotazioni/prenotazioni.service.js';

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

    // BUNDLE: si rimborsa solo per intero. Se la prenotazione fa parte
    // di un ordine bundle, la richiesta si apre per TUTTE le
    // prenotazioni ancora attive di quell'ordine, insieme, con lo
    // stesso ordineId — l'admin le valuta come una cosa sola. Riusa la
    // stessa macchina per singola prenotazione (posti liberati,
    // credito, email), nessun secondo flusso.
    if (p.ordineId) {
      const [ord] = await db.select().from(ordini).where(eq(ordini.id, p.ordineId)).limit(1);
      if (ord?.bundleId) {
        const sorelle = await db.select().from(prenotazioni).where(and(eq(prenotazioni.ordineId, ord.id), eq(prenotazioni.stato, 'CONFERMATA')));
        const giaInAttesa = await db.select({ prenotazioneId: richiesteRimborso.prenotazioneId }).from(richiesteRimborso)
          .where(and(inArray(richiesteRimborso.prenotazioneId, sorelle.map((s) => s.id)), eq(richiesteRimborso.stato, 'IN_ATTESA')));
        if (giaInAttesa.length > 0) throw new ConflittoDati('C\'è già una richiesta di rimborso in attesa per questo bundle.');
        const create = await db.insert(richiesteRimborso)
          .values(sorelle.map((s) => ({ prenotazioneId: s.id, ordineId: ord.id, motivo: motivo ? `[Bundle, ${sorelle.length} eventi] ${motivo}` : `[Bundle, ${sorelle.length} eventi]` })))
          .returning();
        return create.find((r) => r.prenotazioneId === p.id) ?? create[0];
      }
    }

    // Il controllo sopra copre il caso normale con un messaggio
    // chiaro — ma tra quel controllo e questo INSERT c'è comunque una
    // finestra (due richieste quasi simultanee). Il database stesso
    // blocca il doppione grazie al vincolo di unicità parziale sulla
    // tabella (una sola riga IN_ATTESA per prenotazione): se capita
    // proprio in quella finestra, l'INSERT fallisce e lo trasformiamo
    // nello stesso messaggio comprensibile invece di un errore grezzo.
    try {
      const [nuova] = await db.insert(richiesteRimborso).values({ prenotazioneId: p.id, motivo }).returning();
      return nuova;
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new ConflittoDati('C\'è già una richiesta di rimborso in attesa per questa prenotazione.');
      }
      throw err;
    }
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
      // Meta continuerebbe altrimenti a considerare valido per sempre
      // un acquisto ormai rimborsato — le sue campagne ottimizzerebbero
      // (e i tuoi numeri di ritorno pubblicitario risulterebbero)
      // gonfiati rispetto alla realtà. Best-effort, come ogni chiamata
      // a Meta: un problema qui non deve mai bloccare un rimborso già
      // deciso.
      const [u] = await db.select({ email: utenti.email }).from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
      if (u) {
        inviaEventoMetaSeConfigurato({
          nomeEvento: 'Refund', eventId: `refund-${p.id}`, valore: Number(p.totale), email: u.email,
        }, p.canaleVendita === 'WHITE_LABEL' ? p.whiteLabelId ?? undefined : undefined).catch(() => {});
      }
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
