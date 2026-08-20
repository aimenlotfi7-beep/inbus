import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { prenotazioni, eventi, utenti, partecipantiPrenotazione } from '../../db/schema.js';
import { NonTrovato, ConflittoDati } from '../../shared/errors.js';
import { inviaEmail } from '../../shared/email.service.js';

/** Genera un token casuale per il QR — apposta separato dal PNR (che è
 *  corto e già mostrato via email/sito): il QR deve restare qualcosa che
 *  non si indovina, mentre il PNR resta comodo da leggere e dettare al
 *  telefono. */
function generaTokenTicket() {
  return crypto.randomBytes(24).toString('hex');
}

/** Colore di base se l'evento non ne ha impostato uno suo — nero
 *  semplice, sempre leggibile e stampabile in bianco e nero. */
const COLORE_ACCENTO_BASE = '#111111';

/** Scarica un'immagine da un URL (per l'intestazione del biglietto) —
 *  se fallisce per qualunque motivo (link rotto, sito irraggiungibile),
 *  non blocca la generazione del biglietto: semplicemente non ci sarà
 *  l'immagine, il resto del biglietto resta comunque valido. */
async function scaricaImmagine(url: string): Promise<Buffer | null> {
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    return Buffer.from(await risposta.arrayBuffer());
  } catch {
    return null;
  }
}

/** Disegna il PDF del biglietto — layout semplice, pensato per essere
 *  letto facilmente anche stampato in bianco e nero o mostrato dallo
 *  schermo di un telefono al buio fuori da un bus. Colore ed eventuale
 *  immagine d'intestazione sono personalizzabili per evento dal
 *  gestionale — se non impostati, usa l'aspetto di base neutro. */
async function generaPdfBiglietto(dati: {
  artista: string; dataEvento: Date; fermataCitta: string; fermataOrario: string | null;
  passeggeriNomi: string[]; pnr: string; qrDataUrl: string;
  coloreAccento: string | null; immagineSfondoUrl: string | null;
}): Promise<Buffer> {
  const colore = dati.coloreAccento || COLORE_ACCENTO_BASE;
  const immagineBuffer = dati.immagineSfondoUrl ? await scaricaImmagine(dati.immagineSfondoUrl) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 0 });
    const chunk: Buffer[] = [];
    doc.on('data', (c) => chunk.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunk)));
    doc.on('error', reject);

    const margine = 36;
    let cursoreY = margine;

    // Immagine d'intestazione (facoltativa, per evento): una fascia in
    // cima, larga quanto la pagina — il resto del contenuto parte da
    // sotto di lei, invece che sovrapporsi.
    if (immagineBuffer) {
      const altezzaFascia = 130;
      try {
        doc.image(immagineBuffer, 0, 0, { width: doc.page.width, height: altezzaFascia, cover: [doc.page.width, altezzaFascia] });
        cursoreY = altezzaFascia + 20;
      } catch {
        // Se il file scaricato non è davvero un'immagine valida, non
        // blocco tutto il biglietto per questo — riparto senza fascia.
        cursoreY = margine;
      }
    }

    doc.x = margine;
    doc.y = cursoreY;

    doc.fillColor(colore).font('Helvetica-Bold').fontSize(22).text('INBUS', margine, doc.y, { align: 'left' });
    doc.font('Helvetica').fontSize(11).fillColor('#666').text('BIGLIETTO DIGITALE', margine, doc.y);
    doc.moveDown(1.2);

    doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('EVENTO', margine, doc.y);
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text(dati.artista, margine, doc.y);
    doc.font('Helvetica').fontSize(12).text(
      dati.dataEvento.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      margine, doc.y,
    );
    doc.moveDown(1);

    doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PARTENZA', margine, doc.y);
    doc.fillColor('#000').font('Helvetica').fontSize(13).text(`${dati.fermataCitta}${dati.fermataOrario ? ` — ore ${dati.fermataOrario}` : ''}`, margine, doc.y);
    doc.moveDown(1);

    doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PASSEGGER' + (dati.passeggeriNomi.length > 1 ? 'I' : 'O'), margine, doc.y);
    doc.fillColor('#000').font('Helvetica').fontSize(12).text(dati.passeggeriNomi.join('\n'), margine, doc.y);
    doc.moveDown(1);

    doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PNR', margine, doc.y);
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(16).text(dati.pnr, margine, doc.y);
    doc.moveDown(1.2);

    const qrBuffer = Buffer.from(dati.qrDataUrl.split(',')[1], 'base64');
    const qrSize = 140;
    doc.image(qrBuffer, doc.page.width / 2 - qrSize / 2, doc.y, { width: qrSize, height: qrSize });
    doc.y += qrSize + 10;

    doc.font('Helvetica').fontSize(9).fillColor('#666').text(
      'Conserva questo biglietto e mostralo al momento della salita sul bus.',
      margine, doc.y, { align: 'center', width: doc.page.width - margine * 2 },
    );

    doc.end();
  });
}

export const ticketService = {
  /** Emette davvero il biglietto: genera token+PDF, manda l'email con
   *  l'allegato, salva lo stato. Va chiamata solo quando la prenotazione
   *  è pagata per intero (subito se paga tutto, oppure dopo che ha
   *  saldato il resto se aveva pagato ad acconto) — non prima, altrimenti
   *  un cliente con solo l'acconto avrebbe già in mano un biglietto
   *  "valido" per salire sul bus senza aver finito di pagare. */
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
    const pdfBuffer = await generaPdfBiglietto({
      artista: evento.artista,
      dataEvento: evento.data,
      fermataCitta: p.fermataCitta,
      fermataOrario: p.fermataOrario,
      passeggeriNomi,
      pnr: p.pnr,
      qrDataUrl,
      coloreAccento: evento.ticketColoreAccento,
      immagineSfondoUrl: evento.ticketImmagineSfondoUrl,
    });

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
        allegati: [{ nomeFile: `biglietto-${p.pnr}.pdf`, contenuto: pdfBuffer, tipo: 'application/pdf' }],
      });
    }
  },
};
