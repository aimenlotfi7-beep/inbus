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

/** Disegna il PDF del biglietto — layout semplice, pensato per essere
 *  letto facilmente anche stampato in bianco e nero o mostrato dallo
 *  schermo di un telefono al buio fuori da un bus. */
async function generaPdfBiglietto(dati: {
  artista: string; dataEvento: Date; fermataCitta: string; fermataOrario: string | null;
  passeggeriNomi: string[]; pnr: string; qrDataUrl: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunk: Buffer[] = [];
    doc.on('data', (c) => chunk.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunk)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(22).text('INBUS', { align: 'left' });
    doc.font('Helvetica').fontSize(11).fillColor('#666').text('BIGLIETTO DIGITALE', { align: 'left' });
    doc.moveDown(1.2);

    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text('EVENTO');
    doc.font('Helvetica-Bold').fontSize(18).text(dati.artista);
    doc.font('Helvetica').fontSize(12).text(
      dati.dataEvento.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    );
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(10).text('PARTENZA');
    doc.font('Helvetica').fontSize(13).text(`${dati.fermataCitta}${dati.fermataOrario ? ` — ore ${dati.fermataOrario}` : ''}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(10).text('PASSEGGER' + (dati.passeggeriNomi.length > 1 ? 'I' : 'O'));
    doc.font('Helvetica').fontSize(12).text(dati.passeggeriNomi.join('\n'));
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(10).text('PNR');
    doc.font('Helvetica-Bold').fontSize(16).text(dati.pnr);
    doc.moveDown(1.2);

    const qrBuffer = Buffer.from(dati.qrDataUrl.split(',')[1], 'base64');
    const qrSize = 140;
    doc.image(qrBuffer, doc.page.width / 2 - qrSize / 2, doc.y, { width: qrSize, height: qrSize });
    doc.y += qrSize + 10;

    doc.font('Helvetica').fontSize(9).fillColor('#666').text(
      'Conserva questo biglietto e mostralo al momento della salita sul bus.',
      { align: 'center' },
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
    });

    await db.update(prenotazioni).set({
      ticketToken: token,
      ticketStato: 'EMESSO',
      ticketEmessoIl: new Date(),
    }).where(eq(prenotazioni.id, p.id));

    const [utente] = await db.select().from(utenti).where(eq(utenti.id, p.utenteId)).limit(1);
    if (utente?.email) {
      await inviaEmail({
        a: utente.email,
        oggetto: `Il tuo biglietto — PNR ${p.pnr}`,
        html: `
          <p>Ciao,</p>
          <p>ecco il tuo biglietto digitale per <b>${evento.artista}</b> — trovi tutto in allegato (PDF con QR).</p>
          <p>Mostralo al momento della salita sul bus, anche direttamente dallo schermo del telefono.</p>
          <p>PNR: <b>${p.pnr}</b></p>
        `,
        allegati: [{ nomeFile: `biglietto-${p.pnr}.pdf`, contenuto: pdfBuffer, tipo: 'application/pdf' }],
      });
    }
  },
};
