import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, partecipantiPrenotazione } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';
import { layoutBigliettoService, disegnaBigliettoPdf } from '../layout-biglietto/layout-biglietto.service.js';

/** Genera un token casuale per il QR — apposta separato dal PNR (che è
 *  corto e già mostrato via email/sito): il QR deve restare qualcosa che
 *  non si indovina, mentre il PNR resta comodo da leggere e dettare al
 *  telefono. */
function generaTokenTicket() {
  return crypto.randomBytes(24).toString('hex');
}

export const ticketService = {
  /** Emette davvero il biglietto: genera token+PDF (uno per passeggero,
   *  seguendo il layout scelto per l'evento, o quello predefinito), manda
   *  l'email con gli allegati, salva lo stato. Va chiamata solo quando la
   *  prenotazione è pagata per intero (subito se paga tutto, oppure dopo
   *  che ha saldato il resto se aveva pagato ad acconto) — non prima,
   *  altrimenti un cliente con solo l'acconto avrebbe già in mano un
   *  biglietto "valido" per salire sul bus senza aver finito di pagare. */
  async emetti(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (!p.saldoPagato) throw new ConflittoDati('Il biglietto si emette solo a saldo completato.');
    if (p.ticketToken) return; // già emesso, non rifarlo (es. saldaResto chiamato due volte)

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    const partecipanti = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.prenotazioneId, p.id))
      .orderBy(partecipantiPrenotazione.ordine);
    const passeggeriNomi = partecipanti.length > 0
      ? partecipanti.map((pt) => `${pt.nome} ${pt.cognome}`)
      : [p.referenteNome ?? 'Passeggero'];

    const token = generaTokenTicket();
    const qrDataUrl = await QRCode.toDataURL(`INBUS:TICKET:${p.pnr}:${token}`, { margin: 1, width: 300 });

    // Il layout (colori, ordine delle sezioni, posizione del QR) è
    // quello scelto per questo evento, o il predefinito se non ne ha
    // scelto uno — calcolato una sola volta, riusato per ogni passeggero.
    const config = await layoutBigliettoService.getPerEvento(evento.layoutBigliettoId);
    const configEffettiva = evento.ticketColoreAccento ? { ...config, coloreAccento: evento.ticketColoreAccento } : config;

    // Un PDF distinto per ogni passeggero (solo il proprio nome sopra,
    // non l'elenco di tutti) — più semplice da distribuire fisicamente
    // il giorno della partenza, ognuno ha il suo. Il QR è lo stesso su
    // tutti (la prenotazione è una sola, resta un unico record).
    const allegati = await Promise.all(passeggeriNomi.map(async (nomePasseggero, indice) => {
      const pdfBuffer = await disegnaBigliettoPdf(configEffettiva, {
        artista: evento.artista,
        dataEvento: evento.data,
        fermataCitta: p.fermataCitta,
        fermataOrario: p.fermataOrario,
        passeggeriNomi: [nomePasseggero],
        pnr: p.pnr,
        qrDataUrl,
        immagineIntestazioneUrl: evento.ticketImmagineSfondoUrl,
      });
      const nomeFile = passeggeriNomi.length > 1
        ? `biglietto-${p.pnr}-${indice + 1}-${nomePasseggero.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`
        : `biglietto-${p.pnr}.pdf`;
      return { nomeFile, contenuto: pdfBuffer, tipo: 'application/pdf' };
    }));

    await db.update(prenotazioni).set({
      ticketToken: token,
      ticketStato: 'EMESSO',
      ticketEmessoIl: new Date(),
    }).where(eq(prenotazioni.id, p.id));

    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (utente?.email) {
      const { templateEmailService } = await import('../template-email/template-email.service.js');
      const { oggetto, html } = await templateEmailService.renderizza('ticket', {
        evento: evento.artista,
        pnr: p.pnr,
      });
      await inviaEmail({
        a: utente.email,
        oggetto,
        html,
        allegati,
      });
    }
  },
};
