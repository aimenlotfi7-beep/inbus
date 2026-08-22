import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, partecipantiPrenotazione } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';
import { layoutBigliettoService, disegnaBigliettoPdf } from '../layout-biglietto/layout-biglietto.service.js';

/** Genera un token casuale — usato sia per il "lotto" della prenotazione
 *  (ticketToken su prenotazioni, segna che il biglietto è stato emesso)
 *  sia, uno diverso per ciascuno, per ogni singolo passeggero (serve al
 *  controllo accessi sul bus, per contare chi è salito davvero persona
 *  per persona, non a gruppo intero). */
function generaToken() {
  return crypto.randomBytes(24).toString('hex');
}

export const ticketService = {
  /** Emette davvero il biglietto: genera un PDF+QR per ogni passeggero
   *  (ognuno col proprio codice univoco, non condiviso), seguendo il
   *  layout scelto per l'evento (o quello predefinito), manda l'email
   *  con gli allegati. Va chiamata solo quando la prenotazione è pagata
   *  per intero (subito se paga tutto, oppure dopo che ha saldato il
   *  resto se aveva pagato ad acconto) — non prima, altrimenti un
   *  cliente con solo l'acconto avrebbe già in mano un biglietto
   *  "valido" per salire sul bus senza aver finito di pagare. */
  async emetti(pnr: string) {
    const [p] = await db.select().from(prenotazioni).where(eq(prenotazioni.pnr, pnr)).limit(1);
    if (!p) throw new NonTrovato('Prenotazione');
    if (p.stato !== 'CONFERMATA') throw new ConflittoDati('Questa prenotazione non è più valida.');
    if (!p.saldoPagato) throw new ConflittoDati('Il biglietto si emette solo a saldo completato.');
    if (p.ticketToken) return; // già emesso, non rifarlo (es. saldaResto chiamato due volte)

    const [evento] = await db.select().from(eventi).where(eq(eventi.id, p.eventoId)).limit(1);
    if (!evento) throw new NonTrovato('Evento');

    // Il richiedente conta sempre come primo partecipante (vedi
    // prenotazioni.service.ts) — questa lista non è mai vuota.
    const partecipanti = await db
      .select()
      .from(partecipantiPrenotazione)
      .where(eq(partecipantiPrenotazione.prenotazioneId, p.id))
      .orderBy(partecipantiPrenotazione.ordine);

    // Il layout (colori, ordine delle sezioni, posizione del QR) è
    // quello scelto per questo evento, o il predefinito se non ne ha
    // scelto uno — calcolato una sola volta, riusato per ogni passeggero.
    const config = await layoutBigliettoService.getPerEvento(evento.layoutBigliettoId);
    const configEffettiva = evento.ticketColoreAccento ? { ...config, coloreAccento: evento.ticketColoreAccento } : config;

    // Un PDF distinto per ogni passeggero, con un QR proprio (diverso da
    // quello degli altri) — così sul bus si può contare davvero chi è
    // salito, persona per persona, non solo "la prenotazione nel suo
    // complesso".
    const allegati = await Promise.all(partecipanti.map(async (pt, indice) => {
      const tokenPersonale = generaToken();
      await db.update(partecipantiPrenotazione).set({ ticketToken: tokenPersonale }).where(eq(partecipantiPrenotazione.id, pt.id));

      const qrDataUrl = await QRCode.toDataURL(`INBUS:TICKET:${p.pnr}:${tokenPersonale}`, { margin: 1, width: 300 });
      const pdfBuffer = await disegnaBigliettoPdf(configEffettiva, {
        artista: evento.artista,
        dataEvento: evento.data,
        fermataCitta: p.fermataCitta,
        fermataOrario: p.fermataOrario,
        passeggeriNomi: [`${pt.nome} ${pt.cognome}`],
        pnr: p.pnr,
        qrDataUrl,
        immagineIntestazioneUrl: evento.ticketImmagineSfondoUrl,
      });
      const nomeFile = partecipanti.length > 1
        ? `biglietto-${p.pnr}-${indice + 1}-${pt.nome}-${pt.cognome}`.replace(/[^a-zA-Z0-9-]+/g, '-') + '.pdf'
        : `biglietto-${p.pnr}.pdf`;
      return { nomeFile, contenuto: pdfBuffer, tipo: 'application/pdf' };
    }));

    // Il token sulla prenotazione resta come "lotto" — segna che
    // l'emissione è avvenuta, non è più usato per il controllo accessi
    // (quello guarda i token sui singoli partecipanti).
    await db.update(prenotazioni).set({
      ticketToken: generaToken(),
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
