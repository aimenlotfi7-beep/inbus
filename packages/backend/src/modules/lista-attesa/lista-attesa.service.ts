import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { listaAttesa, eventi, prenotazioni, fermate } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail, urlSito } from '../../shared/email.service.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import type { IscrivitiListaAttesaInput } from './lista-attesa.dto.js';

export const listaAttesaService = {
  async iscriviti(input: IscrivitiListaAttesaInput) {
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, input.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    const [riga] = await db.insert(listaAttesa).values({
      eventoId: input.eventoId,
      nome: input.cliente.nome,
      cognome: input.cliente.cognome,
      email: input.cliente.email.toLowerCase(),
      telefono: input.cliente.telefono,
      passeggeri: input.passeggeri,
      lineaId: input.lineaId,
      fermataId: input.fermataId,
      partecipantiJson: JSON.stringify(input.partecipanti),
    }).returning();
    return riga;
  },

  /** Elenco iscrizioni alla lista d'attesa per un evento, con il nome
   *  della fermata scelta (se c'era una disponibile al momento
   *  dell'iscrizione) — così chi gestisce l'evento sa subito per quale
   *  fermata c'è più richiesta. */
  async listByEvento(eventoId: string) {
    const righe = await db
      .select({
        id: listaAttesa.id,
        nome: listaAttesa.nome,
        cognome: listaAttesa.cognome,
        email: listaAttesa.email,
        telefono: listaAttesa.telefono,
        passeggeri: listaAttesa.passeggeri,
        stato: listaAttesa.stato,
        emailInviata: listaAttesa.emailInviata,
        completata: listaAttesa.completata,
        dataCreazione: listaAttesa.dataCreazione,
        fermataCitta: fermate.citta,
      })
      .from(listaAttesa)
      .leftJoin(fermate, eq(fermate.id, listaAttesa.fermataId))
      .where(eq(listaAttesa.eventoId, eventoId))
      .orderBy(desc(listaAttesa.dataCreazione));
    return righe;
  },

  /** Conta i passeggeri totali confermati per un evento (somma su tutte
   *  le prenotazioni CONFERMATA) — usato per mostrare "N partecipanti"
   *  nella scheda evento. */
  async contaPartecipanti(eventoId: string) {
    const righe = await db
      .select({ passeggeri: prenotazioni.passeggeri })
      .from(prenotazioni)
      .where(and(eq(prenotazioni.eventoId, eventoId), eq(prenotazioni.stato, 'CONFERMATA')));
    return righe.reduce((somma, r) => somma + r.passeggeri, 0);
  },

  /** Quante iscrizioni sono ancora "in attesa" (non promosse) su tutti
   *  gli eventi — usato per il pallino di notifica sulla voce "Lista
   *  d'attesa" nel menu del gestionale: se c'è qualcuno in attesa, va
   *  segnalato subito, senza dover aprire ogni evento per scoprirlo. */
  async contaInAttesa() {
    const righe = await db.select({ id: listaAttesa.id }).from(listaAttesa).where(eq(listaAttesa.stato, 'IN_ATTESA'));
    return righe.length;
  },

  /** Genera un token univoco e manda l'email con il link "completa la tua
   *  prenotazione" — non crea ancora la prenotazione vera: quella viene
   *  creata solo quando il cliente clicca e finalizza davvero (così, se
   *  nel frattempo i posti finiscono di nuovo, non si vende due volte lo
   *  stesso posto: il blocco atomico scatta comunque in quel momento). */
  async promuovi(id: string) {
    const [riga] = await db.select().from(listaAttesa).where(eq(listaAttesa.id, id)).limit(1);
    if (!riga) throw new NonTrovato('Iscrizione alla lista d\'attesa');
    if (riga.stato === 'PROMOSSA' && riga.completata) {
      throw new ConflittoDati('Questa iscrizione è già stata completata.');
    }

    const token = riga.token ?? crypto.randomBytes(24).toString('hex');
    await db.update(listaAttesa).set({ stato: 'PROMOSSA', token }).where(eq(listaAttesa.id, id));

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, riga.eventoId)).limit(1);
    const link = urlSito(`/finalizza/${token}`);
    const { templateEmailService } = await import('../template-email/template-email.service.js');
    const { oggetto, html } = await templateEmailService.renderizza('lista_attesa_promossa', {
      nome: riga.nome,
      evento: evento?.artista ?? 'il tuo evento',
      link,
    });
    const { inviata } = await inviaEmail({ a: riga.email, oggetto, html });
    await db.update(listaAttesa).set({ emailInviata: inviata }).where(eq(listaAttesa.id, id));
    return { ok: true, emailInviata: inviata, link };
  },

  async getByToken(token: string) {
    const [riga] = await db.select().from(listaAttesa).where(eq(listaAttesa.token, token)).limit(1);
    if (!riga) throw new NonTrovato('Link');
    if (riga.completata) throw new ConflittoDati('Questa prenotazione è già stata completata.');
    const [evento] = await db.select().from(eventi).where(eq(eventi.id, riga.eventoId)).limit(1);
    return {
      eventoId: riga.eventoId,
      artista: evento?.artista ?? '',
      luogo: evento?.luogo ?? '',
      citta: evento?.citta ?? '',
      data: evento?.data ?? null,
      lineaId: riga.lineaId,
      fermataId: riga.fermataId,
      passeggeri: riga.passeggeri,
      nome: riga.nome,
      cognome: riga.cognome ?? '',
      email: riga.email,
      telefono: riga.telefono ?? '',
      partecipanti: riga.partecipantiJson ? JSON.parse(riga.partecipantiJson) : [],
    };
  },

  /** Crea davvero la prenotazione (riusando la stessa logica del
   *  checkout normale, blocco posti atomico incluso) e segna l'iscrizione
   *  come completata. `input` può correggere lineaId/fermataId scelti
   *  dal cliente in questa pagina, se diversi da quelli preferiti in
   *  origine. */
  async finalizza(token: string, input: { lineaId: string; fermataId: string; tipoPagamento: 'COMPLETO' | 'ACCONTO'; metodoPagamento: 'CARTA' | 'PAYPAL' | 'SATISPAY' | 'DA_CONCORDARE' }) {
    const [riga] = await db.select().from(listaAttesa).where(eq(listaAttesa.token, token)).limit(1);
    if (!riga) throw new NonTrovato('Link');
    if (riga.completata) throw new ConflittoDati('Questa prenotazione è già stata completata.');

    // Questo flusso arriva da un link segreto mandato via email (non da
    // un login vero) — stesso livello di identità già accettato altrove
    // (es. richieste di rimborso): l'email combacia, è sufficiente per
    // questo caso specifico. Se non esiste ancora un account con
    // quell'email, ne creo uno "leggero" (senza password) — dovrà
    // comunque registrarsi per accedere alla sua area personale in
    // futuro, ma la prenotazione da qui non resta bloccata.
    const { utentiService } = await import('../utenti/utenti.service.js');
    const utente = await utentiService.upsertByEmail({
      email: riga.email, nome: riga.nome, cognome: riga.cognome ?? '', telefono: riga.telefono ?? '',
    });

    const prenotazione = await prenotazioniService.crea({
      eventoId: riga.eventoId,
      lineaId: input.lineaId,
      fermataId: input.fermataId,
      passeggeri: riga.passeggeri,
      tipoPagamento: input.tipoPagamento,
      metodoPagamento: input.metodoPagamento,
      cliente: { email: riga.email, nome: riga.nome, cognome: riga.cognome ?? '', telefono: riga.telefono ?? '' },
      partecipanti: riga.partecipantiJson ? JSON.parse(riga.partecipantiJson) : [],
    }, utente.id);

    await db.update(listaAttesa).set({ completata: true }).where(eq(listaAttesa.id, riga.id));
    return prenotazione;
  },
};
