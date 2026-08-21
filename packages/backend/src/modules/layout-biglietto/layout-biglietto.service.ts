import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { db } from '../../db/client.js';
import { layoutBiglietto } from '../../db/schema.js';
import { NonTrovato, ErroreApplicativo } from '../../shared/errors.js';

/** Le sezioni disponibili per comporre il biglietto — l'ordine in cui
 *  compaiono nell'array "ordineElementi" della configurazione è l'ordine
 *  in cui vengono disegnate sul PDF, dall'alto in basso. Non è un
 *  posizionamento libero pixel-per-pixel (rischierebbe sovrapposizioni
 *  strane cambiando i dati) — ma riordinare le sezioni, spostare il QR,
 *  cambiarne la dimensione/allineamento e i colori copre comunque bene
 *  "spostare posizione QR code, scritte e immagini". */
export const SEZIONI_DISPONIBILI = ['intestazione_immagine', 'titolo', 'evento', 'partenza', 'passeggero', 'pnr', 'qr', 'nota'] as const;
export type SezioneBiglietto = typeof SEZIONI_DISPONIBILI[number];

export interface ConfigurazioneLayout {
  coloreAccento: string; // usato se l'evento non ne ha impostato uno suo
  ordineElementi: SezioneBiglietto[];
  qr: { dimensione: number; allineamento: 'sinistra' | 'centro' | 'destra' };
  spaziaturaSezioni: number; // moltiplicatore della spaziatura verticale tra sezioni (1 = normale)
}

/** Configurazione di base — usata per il layout "predefinito" creato al
 *  primo avvio, e come riferimento per capire la struttura attesa. */
export const CONFIG_BASE: ConfigurazioneLayout = {
  coloreAccento: '#111111',
  ordineElementi: ['intestazione_immagine', 'titolo', 'evento', 'partenza', 'passeggero', 'pnr', 'qr', 'nota'],
  qr: { dimensione: 140, allineamento: 'centro' },
  spaziaturaSezioni: 1,
};

/** Da chiamare una volta all'avvio del server: crea il layout
 *  "predefinito" se non esiste ancora nessun layout — non tocca mai
 *  quelli già esistenti. */
export async function sincronizzaLayoutBiglietto() {
  const [esistente] = await db.select({ id: layoutBiglietto.id }).from(layoutBiglietto).limit(1);
  if (!esistente) {
    await db.insert(layoutBiglietto).values({
      nome: 'Standard',
      predefinito: true,
      configurazione: JSON.stringify(CONFIG_BASE),
    });
  }
}

function validaConfigurazione(testo: string): ConfigurazioneLayout {
  let dati: unknown;
  try {
    dati = JSON.parse(testo);
  } catch {
    throw new ErroreApplicativo('La configurazione non è un JSON valido.');
  }
  const c = dati as Partial<ConfigurazioneLayout>;
  if (!c.ordineElementi || !Array.isArray(c.ordineElementi) || c.ordineElementi.some((e) => !SEZIONI_DISPONIBILI.includes(e))) {
    throw new ErroreApplicativo(`"ordineElementi" deve essere un elenco con solo questi valori: ${SEZIONI_DISPONIBILI.join(', ')}.`);
  }
  if (!c.coloreAccento || typeof c.coloreAccento !== 'string') {
    throw new ErroreApplicativo('"coloreAccento" mancante o non valido.');
  }
  if (!c.qr || typeof c.qr.dimensione !== 'number' || !['sinistra', 'centro', 'destra'].includes(c.qr.allineamento as string)) {
    throw new ErroreApplicativo('"qr" mancante o non valido (servono dimensione e allineamento).');
  }
  return {
    coloreAccento: c.coloreAccento,
    ordineElementi: c.ordineElementi,
    qr: c.qr,
    spaziaturaSezioni: typeof c.spaziaturaSezioni === 'number' ? c.spaziaturaSezioni : 1,
  };
}

async function scaricaImmagine(url: string): Promise<Buffer | null> {
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    return Buffer.from(await risposta.arrayBuffer());
  } catch {
    return null;
  }
}

/** Disegna davvero il PDF del biglietto, seguendo l'ordine e lo stile
 *  della configurazione. Usata sia per l'emissione vera (ticket.service)
 *  sia per l'anteprima di prova nell'editor del layout. */
export async function disegnaBigliettoPdf(config: ConfigurazioneLayout, dati: {
  artista: string; dataEvento: Date; fermataCitta: string; fermataOrario: string | null;
  passeggeriNomi: string[]; pnr: string; qrDataUrl: string; immagineIntestazioneUrl: string | null;
}): Promise<Buffer> {
  const immagineBuffer = dati.immagineIntestazioneUrl ? await scaricaImmagine(dati.immagineIntestazioneUrl) : null;
  const colore = config.coloreAccento;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 0 });
    const chunk: Buffer[] = [];
    doc.on('data', (c) => chunk.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunk)));
    doc.on('error', reject);

    const margine = 36;
    const spazio = () => doc.moveDown(1 * config.spaziaturaSezioni);
    let primaSezioneTesto = true;

    for (const sezione of config.ordineElementi) {
      if (sezione === 'intestazione_immagine') {
        if (immagineBuffer) {
          const altezzaFascia = 130;
          try {
            doc.image(immagineBuffer, 0, 0, { width: doc.page.width, height: altezzaFascia, cover: [doc.page.width, altezzaFascia] });
            doc.x = margine;
            doc.y = altezzaFascia + 20;
          } catch {
            doc.x = margine;
            doc.y = margine;
          }
        }
        continue;
      }

      if (!primaSezioneTesto || doc.y < margine) doc.x = margine;
      if (doc.y < margine) doc.y = margine;

      if (sezione === 'titolo') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(22).text('INBUS', margine, doc.y);
        doc.font('Helvetica').fontSize(11).fillColor('#666').text('BIGLIETTO DIGITALE', margine, doc.y);
        spazio();
      } else if (sezione === 'evento') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('EVENTO', margine, doc.y);
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text(dati.artista, margine, doc.y);
        doc.font('Helvetica').fontSize(12).text(
          dati.dataEvento.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          margine, doc.y,
        );
        spazio();
      } else if (sezione === 'partenza') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PARTENZA', margine, doc.y);
        doc.fillColor('#000').font('Helvetica').fontSize(13).text(`${dati.fermataCitta}${dati.fermataOrario ? ` — ore ${dati.fermataOrario}` : ''}`, margine, doc.y);
        spazio();
      } else if (sezione === 'passeggero') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PASSEGGER' + (dati.passeggeriNomi.length > 1 ? 'I' : 'O'), margine, doc.y);
        doc.fillColor('#000').font('Helvetica').fontSize(12).text(dati.passeggeriNomi.join('\n'), margine, doc.y);
        spazio();
      } else if (sezione === 'pnr') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PNR', margine, doc.y);
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(16).text(dati.pnr, margine, doc.y);
        spazio();
      } else if (sezione === 'qr') {
        const qrBuffer = Buffer.from(dati.qrDataUrl.split(',')[1], 'base64');
        const dim = config.qr.dimensione;
        const x = config.qr.allineamento === 'sinistra' ? margine
          : config.qr.allineamento === 'destra' ? doc.page.width - margine - dim
          : doc.page.width / 2 - dim / 2;
        doc.image(qrBuffer, x, doc.y, { width: dim, height: dim });
        doc.y += dim + 10;
      } else if (sezione === 'nota') {
        doc.font('Helvetica').fontSize(9).fillColor('#666').text(
          'Conserva questo biglietto e mostralo al momento della salita sul bus.',
          margine, doc.y, { align: 'center', width: doc.page.width - margine * 2 },
        );
        spazio();
      }
      primaSezioneTesto = false;
    }

    doc.end();
  });
}

export const layoutBigliettoService = {
  async list() {
    return db.select().from(layoutBiglietto).orderBy(layoutBiglietto.nome);
  },

  async getById(id: string) {
    const [riga] = await db.select().from(layoutBiglietto).where(eq(layoutBiglietto.id, id)).limit(1);
    if (!riga) throw new NonTrovato('Layout');
    return riga;
  },

  /** Il layout da usare per un evento: il suo, se ne ha scelto uno —
   *  altrimenti quello segnato come predefinito. */
  async getPerEvento(layoutBigliettoId: string | null): Promise<ConfigurazioneLayout> {
    if (layoutBigliettoId) {
      const [riga] = await db.select().from(layoutBiglietto).where(eq(layoutBiglietto.id, layoutBigliettoId)).limit(1);
      if (riga) return validaConfigurazione(riga.configurazione);
    }
    const [predefinito] = await db.select().from(layoutBiglietto).where(eq(layoutBiglietto.predefinito, true)).limit(1);
    if (predefinito) return validaConfigurazione(predefinito.configurazione);
    return CONFIG_BASE; // rete di sicurezza, non dovrebbe mai servire davvero
  },

  async crea(input: { nome: string; configurazione: string }) {
    validaConfigurazione(input.configurazione); // solo per validare, lancia errore se non va bene
    const [nuovo] = await db.insert(layoutBiglietto).values({ nome: input.nome, configurazione: input.configurazione }).returning();
    return nuovo;
  },

  async aggiorna(id: string, input: { nome?: string; configurazione?: string }) {
    if (input.configurazione !== undefined) validaConfigurazione(input.configurazione);
    await db.update(layoutBiglietto).set({
      ...(input.nome !== undefined && { nome: input.nome }),
      ...(input.configurazione !== undefined && { configurazione: input.configurazione }),
      aggiornatoIl: new Date(),
    }).where(eq(layoutBiglietto.id, id));
  },

  /** Segna questo layout come predefinito — toglie il segno a tutti gli
   *  altri (ne può esistere solo uno alla volta). */
  async impostaPredefinito(id: string) {
    await db.update(layoutBiglietto).set({ predefinito: false });
    await db.update(layoutBiglietto).set({ predefinito: true }).where(eq(layoutBiglietto.id, id));
  },

  async elimina(id: string) {
    const [riga] = await db.select().from(layoutBiglietto).where(eq(layoutBiglietto.id, id)).limit(1);
    if (riga?.predefinito) throw new ErroreApplicativo('Non puoi eliminare il layout predefinito — impostane prima un altro come predefinito.');
    await db.delete(layoutBiglietto).where(eq(layoutBiglietto.id, id));
  },

  /** Genera un PDF di prova con dati finti, usando una configurazione
   *  che potrebbe non essere ancora salvata — così si può vedere il
   *  risultato prima di confermare le modifiche. */
  async generaAnteprima(configurazioneTesto: string) {
    const config = validaConfigurazione(configurazioneTesto);
    const QRCode = (await import('qrcode')).default;
    const qrDataUrl = await QRCode.toDataURL('INBUS:TICKET:IB1DI38J:anteprima', { margin: 1, width: 300 });
    return disegnaBigliettoPdf(config, {
      artista: 'Nome Artista (prova)',
      dataEvento: new Date(),
      fermataCitta: 'Milano',
      fermataOrario: '18:30',
      passeggeriNomi: ['Mario Rossi'],
      pnr: 'IB1DI38J',
      qrDataUrl,
      immagineIntestazioneUrl: null,
    });
  },
};
