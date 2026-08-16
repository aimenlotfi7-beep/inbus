import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../db/client.js';
import { listaAttesa, eventi, prenotazioni } from '../../db/schema.js';
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

  async listByEvento(eventoId: string) {
    return db.select().from(listaAttesa).where(eq(listaAttesa.eventoId, eventoId)).orderBy(desc(listaAttesa.dataCreazione));
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
    const { inviata } = await inviaEmail({
      a: riga.email,
      oggetto: `Ci sono posti per ${evento?.artista ?? 'il tuo evento'}!`,
      html: `<p>Ciao ${riga.nome},</p><p>Si sono liberati posti per <b>${evento?.artista ?? ''}</b>. Completa la tua prenotazione entro le prossime ore, prima che si esauriscano di nuovo:</p><p><a href="${link}">Completa la prenotazione</a></p>`,
    });
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

    const prenotazione = await prenotazioniService.crea({
      eventoId: riga.eventoId,
      lineaId: input.lineaId,
      fermataId: input.fermataId,
      passeggeri: riga.passeggeri,
      tipoPagamento: input.tipoPagamento,
      metodoPagamento: input.metodoPagamento,
      cliente: { email: riga.email, nome: riga.nome, cognome: riga.cognome ?? '', telefono: riga.telefono ?? '' },
      partecipanti: riga.partecipantiJson ? JSON.parse(riga.partecipantiJson) : [],
    });

    await db.update(listaAttesa).set({ completata: true }).where(eq(listaAttesa.id, riga.id));
    return prenotazione;
  },
};
