import { eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { db } from '../../db/client.js';
import { layoutBiglietto } from '../../db/schema.js';
import { NonTrovato, ErroreApplicativo } from '../../shared/errors.js';

/** Le sezioni disponibili per comporre il biglietto — ognuna ha una
 *  posizione e una dimensione LIBERE (in percentuale della pagina, non
 *  pixel fissi: così l'editor funziona identico a qualunque zoom/
 *  risoluzione, e il PDF vero — sempre alla stessa dimensione A5 — si
 *  ottiene moltiplicando la percentuale per le dimensioni reali della
 *  pagina). L'admin trascina/ridimensiona ogni sezione dove vuole. */
export const SEZIONI_DISPONIBILI = ['intestazione_immagine', 'titolo', 'evento', 'partenza', 'passeggero', 'pnr', 'qr', 'nota'] as const;
export type SezioneBiglietto = typeof SEZIONI_DISPONIBILI[number];

export interface Posizione {
  x: number; // percentuale da sinistra (0-100)
  y: number; // percentuale dall'alto (0-100)
  larghezza: number; // percentuale della larghezza pagina
  altezza: number; // percentuale dell'altezza pagina
}

export interface ConfigurazioneLayout {
  coloreAccento: string; // usato se l'evento non ne ha impostato uno suo
  posizioni: Record<SezioneBiglietto, Posizione>;
  qr: { dimensione: number }; // percentuale della larghezza pagina — l'allineamento non serve più, la posizione libera lo sostituisce
  sfondoImmagineUrl: string | null;
  // Quanto è visibile lo sfondo importato — 1 = pieno, 0 = del tutto
  // sbiadito verso il bianco (utile per non "coprire" il testo sopra).
  sfondoOpacita: number;
  spaziaturaSezioni: number; // tenuto per compatibilità, non più usato attivamente col posizionamento libero
}

/** Posizioni di partenza — ricalcano grosso modo il vecchio ordine
 *  "a flusso" dall'alto in basso, così un layout esistente aggiornato
 *  a questo nuovo formato parte già da qualcosa di sensato invece che
 *  da zero. */
const POSIZIONI_BASE: Record<SezioneBiglietto, Posizione> = {
  intestazione_immagine: { x: 0, y: 0, larghezza: 100, altezza: 22 },
  titolo: { x: 8, y: 26, larghezza: 84, altezza: 9 },
  evento: { x: 8, y: 37, larghezza: 84, altezza: 15 },
  partenza: { x: 8, y: 54, larghezza: 84, altezza: 8 },
  passeggero: { x: 8, y: 64, larghezza: 84, altezza: 8 },
  pnr: { x: 8, y: 74, larghezza: 84, altezza: 8 },
  qr: { x: 35, y: 82, larghezza: 30, altezza: 15 },
  nota: { x: 8, y: 92, larghezza: 84, altezza: 6 },
};

/** Configurazione di base — usata per il layout "predefinito" creato al
 *  primo avvio, e come riferimento per capire la struttura attesa. */
export const CONFIG_BASE: ConfigurazioneLayout = {
  coloreAccento: '#111111',
  posizioni: POSIZIONI_BASE,
  qr: { dimensione: 33 },
  sfondoImmagineUrl: null,
  sfondoOpacita: 1,
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

function validaPosizione(p: unknown): p is Posizione {
  if (!p || typeof p !== 'object') return false;
  const q = p as Partial<Posizione>;
  return typeof q.x === 'number' && typeof q.y === 'number' && typeof q.larghezza === 'number' && typeof q.altezza === 'number';
}

function validaConfigurazione(testo: string): ConfigurazioneLayout {
  let dati: unknown;
  try {
    dati = JSON.parse(testo);
  } catch {
    throw new ErroreApplicativo('La configurazione non è un JSON valido.');
  }
  const c = dati as Partial<ConfigurazioneLayout>;
  if (!c.coloreAccento || typeof c.coloreAccento !== 'string') {
    throw new ErroreApplicativo('"coloreAccento" mancante o non valido.');
  }
  if (!c.qr || typeof c.qr.dimensione !== 'number') {
    throw new ErroreApplicativo('"qr" mancante o non valido (serve la dimensione).');
  }
  // Le posizioni mancanti prendono quella di base — così un layout
  // vecchio (dal formato precedente) o con una sezione nuova aggiunta
  // in futuro non va mai in errore, semplicemente parte da un punto
  // di partenza sensato invece di rompersi.
  const posizioni: Record<SezioneBiglietto, Posizione> = { ...POSIZIONI_BASE };
  if (c.posizioni && typeof c.posizioni === 'object') {
    for (const sezione of SEZIONI_DISPONIBILI) {
      const p = (c.posizioni as Record<string, unknown>)[sezione];
      if (validaPosizione(p)) posizioni[sezione] = p;
    }
  }
  return {
    coloreAccento: c.coloreAccento,
    posizioni,
    qr: { dimensione: c.qr.dimensione },
    sfondoImmagineUrl: typeof c.sfondoImmagineUrl === 'string' ? c.sfondoImmagineUrl : null,
    sfondoOpacita: typeof c.sfondoOpacita === 'number' ? Math.max(0, Math.min(1, c.sfondoOpacita)) : 1,
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

/** Disegna davvero il PDF del biglietto, ogni sezione nella posizione
 *  libera scelta dall'admin nell'editor (percentuale della pagina,
 *  convertita qui in punti reali). Usata sia per l'emissione vera
 *  (ticket.service) sia per l'anteprima di prova nell'editor. */
export async function disegnaBigliettoPdf(config: ConfigurazioneLayout, dati: {
  artista: string; dataEvento: Date; fermataCitta: string; fermataOrario: string | null;
  passeggeriNomi: string[]; pnr: string; qrDataUrl: string; immagineIntestazioneUrl: string | null;
}): Promise<Buffer> {
  const [immagineIntestazioneBuffer, sfondoBuffer] = await Promise.all([
    dati.immagineIntestazioneUrl ? scaricaImmagine(dati.immagineIntestazioneUrl) : Promise.resolve(null),
    config.sfondoImmagineUrl ? scaricaImmagine(config.sfondoImmagineUrl) : Promise.resolve(null),
  ]);
  const colore = config.coloreAccento;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 0 });
    const chunk: Buffer[] = [];
    doc.on('data', (c) => chunk.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunk)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    // Percentuale -> punti reali della pagina, sempre la stessa
    // formula usata dall'editor per calcolare l'anteprima — così
    // "quello che vedi è quello che ottieni".
    const px = (p: Posizione) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H, larghezza: (p.larghezza / 100) * W, altezza: (p.altezza / 100) * H });

    // Sfondo importato — disegnato per primo, sotto a tutto il resto,
    // poi sfumato verso il bianco in base all'opacità scelta (1 =
    // pieno, 0 = quasi invisibile) così il testo sopra resta leggibile
    // anche con un'immagine vivace.
    if (sfondoBuffer) {
      try {
        doc.image(sfondoBuffer, 0, 0, { width: W, height: H, cover: [W, H] });
        if (config.sfondoOpacita < 1) {
          doc.fillOpacity(1 - config.sfondoOpacita).rect(0, 0, W, H).fill('#ffffff');
          doc.fillOpacity(1);
        }
      } catch { /* sfondo non caricabile, si prosegue senza */ }
    }

    for (const sezione of SEZIONI_DISPONIBILI) {
      const pos = px(config.posizioni[sezione]);

      if (sezione === 'intestazione_immagine') {
        if (immagineIntestazioneBuffer) {
          try {
            doc.image(immagineIntestazioneBuffer, pos.x, pos.y, { width: pos.larghezza, height: pos.altezza, cover: [pos.larghezza, pos.altezza] });
          } catch { /* immagine non caricabile, si salta */ }
        }
      } else if (sezione === 'titolo') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(22).text('INBUS', pos.x, pos.y, { width: pos.larghezza });
        doc.font('Helvetica').fontSize(11).fillColor('#666').text('BIGLIETTO DIGITALE', pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'evento') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('EVENTO', pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text(dati.artista, pos.x, doc.y, { width: pos.larghezza });
        doc.font('Helvetica').fontSize(12).text(
          dati.dataEvento.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          pos.x, doc.y, { width: pos.larghezza },
        );
      } else if (sezione === 'partenza') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PARTENZA', pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica').fontSize(13).text(`${dati.fermataCitta}${dati.fermataOrario ? ` — ore ${dati.fermataOrario}` : ''}`, pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'passeggero') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PASSEGGER' + (dati.passeggeriNomi.length > 1 ? 'I' : 'O'), pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica').fontSize(12).text(dati.passeggeriNomi.join('\n'), pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'pnr') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PNR', pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(16).text(dati.pnr, pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'qr') {
        const qrBuffer = Buffer.from(dati.qrDataUrl.split(',')[1], 'base64');
        const dim = (config.qr.dimensione / 100) * W;
        doc.image(qrBuffer, pos.x, pos.y, { width: dim, height: dim });
      } else if (sezione === 'nota') {
        doc.font('Helvetica').fontSize(9).fillColor('#666').text(
          'Conserva questo biglietto e mostralo al momento della salita sul bus.',
          pos.x, pos.y, { align: 'center', width: pos.larghezza },
        );
      }
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
