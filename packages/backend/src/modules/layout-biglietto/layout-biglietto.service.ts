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

/** Un'immagine/logo aggiuntivo — a differenza delle sezioni fisse
 *  (sempre le stesse 8), qui l'admin ne può aggiungere quante ne
 *  vuole, ognuna con la sua posizione libera. */
export interface ImmagineExtra {
  id: string;
  url: string;
  posizione: Posizione;
}

export interface Sfumatura {
  attiva: boolean;
  tipo: 'lineare' | 'radiale';
  colore: string;
  direzioneGradi: number; // solo per "lineare" — 0 = da sinistra a destra, 90 = dall'alto in basso
  raggio: number; // solo per "radiale" — percentuale della pagina
  opacita: number; // 0-1, quanto è intensa la sfumatura al suo punto più forte
}

export interface ConfigurazioneLayout {
  coloreAccento: string; // usato se l'evento non ne ha impostato uno suo
  coloreSfondo: string; // colore di base della pagina, sotto a tutto (immagine compresa, se semi-trasparente)
  posizioni: Record<SezioneBiglietto, Posizione>;
  immaginiExtra: ImmagineExtra[];
  qr: { dimensione: number }; // percentuale della larghezza pagina — l'allineamento non serve più, la posizione libera lo sostituisce
  sfondoImmagineUrl: string | null;
  sfumatura: Sfumatura;
  spaziaturaSezioni: number; // tenuto per compatibilità, non più usato attivamente col posizionamento libero
}

/** Posizioni di partenza — ricalcano grosso modo il vecchio ordine
 *  "a flusso" dall'alto in basso, così un layout esistente aggiornato
 *  a questo nuovo formato parte già da qualcosa di sensato invece che
 *  da zero. */
const POSIZIONI_BASE: Record<SezioneBiglietto, Posizione> = {
  intestazione_immagine: { x: 0, y: 0, larghezza: 100, altezza: 22 },
  titolo: { x: 8, y: 25, larghezza: 84, altezza: 8 },
  evento: { x: 8, y: 34, larghezza: 84, altezza: 17 },
  partenza: { x: 8, y: 53, larghezza: 84, altezza: 8 },
  passeggero: { x: 8, y: 63, larghezza: 84, altezza: 9 },
  pnr: { x: 8, y: 74, larghezza: 84, altezza: 7 },
  qr: { x: 35, y: 82, larghezza: 30, altezza: 15 },
  nota: { x: 8, y: 93, larghezza: 84, altezza: 5 },
};

/** Configurazione di base — usata per il layout "predefinito" creato al
 *  primo avvio, e come riferimento per capire la struttura attesa. */
export const CONFIG_BASE: ConfigurazioneLayout = {
  coloreAccento: '#111111',
  coloreSfondo: '#ffffff',
  posizioni: POSIZIONI_BASE,
  immaginiExtra: [],
  qr: { dimensione: 33 },
  sfondoImmagineUrl: null,
  sfumatura: { attiva: false, tipo: 'lineare', colore: '#ffffff', direzioneGradi: 90, raggio: 60, opacita: 0.6 },
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
    coloreSfondo: typeof c.coloreSfondo === 'string' ? c.coloreSfondo : '#ffffff',
    posizioni,
    immaginiExtra: Array.isArray(c.immaginiExtra) ? c.immaginiExtra.filter((i) => i && typeof i.id === 'string' && typeof i.url === 'string' && validaPosizione(i.posizione)) : [],
    qr: { dimensione: c.qr.dimensione },
    sfondoImmagineUrl: typeof c.sfondoImmagineUrl === 'string' ? c.sfondoImmagineUrl : null,
    sfumatura: validaSfumatura(c.sfumatura),
    spaziaturaSezioni: typeof c.spaziaturaSezioni === 'number' ? c.spaziaturaSezioni : 1,
  };
}

function validaSfumatura(s: unknown): Sfumatura {
  const base = CONFIG_BASE.sfumatura;
  if (!s || typeof s !== 'object') return base;
  const q = s as Partial<Sfumatura>;
  return {
    attiva: typeof q.attiva === 'boolean' ? q.attiva : base.attiva,
    tipo: q.tipo === 'radiale' ? 'radiale' : 'lineare',
    colore: typeof q.colore === 'string' ? q.colore : base.colore,
    direzioneGradi: typeof q.direzioneGradi === 'number' ? q.direzioneGradi : base.direzioneGradi,
    raggio: typeof q.raggio === 'number' ? q.raggio : base.raggio,
    opacita: typeof q.opacita === 'number' ? Math.max(0, Math.min(1, q.opacita)) : base.opacita,
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
  // Nome del bus/Linea assegnata (es. "Bus 1") — vuoto finché non è
  // ancora stata costruita nessuna Linea che copre questa fermata, o
  // finché non è passato il riordino per fasce d'età (24 ore prima).
  nomeBus?: string | null;
}): Promise<Buffer> {
  const [immagineIntestazioneBuffer, sfondoBuffer, buffersImmaginiExtra] = await Promise.all([
    dati.immagineIntestazioneUrl ? scaricaImmagine(dati.immagineIntestazioneUrl) : Promise.resolve(null),
    config.sfondoImmagineUrl ? scaricaImmagine(config.sfondoImmagineUrl) : Promise.resolve(null),
    Promise.all(config.immaginiExtra.map((extra) => scaricaImmagine(extra.url))),
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

    // Colore di base — sempre disegnato per primo, sotto a tutto
    // (anche sotto l'immagine importata, se questa avesse trasparenza).
    doc.rect(0, 0, W, H).fill(config.coloreSfondo);

    // Sfondo importato, sopra al colore di base.
    if (sfondoBuffer) {
      try {
        doc.image(sfondoBuffer, 0, 0, { width: W, height: H, cover: [W, H] });
      } catch { /* sfondo non caricabile, si prosegue senza */ }
    }

    // Sfumatura vera (lineare o radiale) sopra tutto lo sfondo — non
    // un semplice velo piatto: un vero gradiente, con colore,
    // direzione (lineare) o raggio (radiale) scelti dall'admin. Serve
    // soprattutto a far risaltare il testo sopra un'immagine vivace,
    // sfumando solo dove serve invece di coprire tutto uniformemente.
    if (config.sfumatura.attiva && (sfondoBuffer || config.sfumatura.opacita > 0)) {
      const s = config.sfumatura;
      if (s.tipo === 'lineare') {
        const rad = (s.direzioneGradi * Math.PI) / 180;
        const x0 = W / 2 - (Math.cos(rad) * W) / 2, y0 = H / 2 - (Math.sin(rad) * H) / 2;
        const x1 = W / 2 + (Math.cos(rad) * W) / 2, y1 = H / 2 + (Math.sin(rad) * H) / 2;
        const grad = doc.linearGradient(x0, y0, x1, y1);
        grad.stop(0, s.colore, 0).stop(1, s.colore, s.opacita);
        doc.rect(0, 0, W, H).fill(grad);
      } else {
        const raggioPt = (s.raggio / 100) * Math.max(W, H);
        const grad = doc.radialGradient(W / 2, H / 2, 0, W / 2, H / 2, raggioPt);
        grad.stop(0, s.colore, 0).stop(1, s.colore, s.opacita);
        doc.rect(0, 0, W, H).fill(grad);
      }
    }

    // Loghi/immagini extra — quanti l'admin ne ha aggiunti, ognuno
    // nella sua posizione libera.
    for (let i = 0; i < config.immaginiExtra.length; i++) {
      const buffer = buffersImmaginiExtra[i];
      if (!buffer) continue;
      const pos = px(config.immaginiExtra[i].posizione);
      try {
        doc.image(buffer, pos.x, pos.y, { width: pos.larghezza, height: pos.altezza, fit: [pos.larghezza, pos.altezza] });
      } catch { /* immagine non caricabile, si salta */ }
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
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(22).text('OnWay', pos.x, pos.y, { width: pos.larghezza });
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
        if (dati.nomeBus) {
          doc.fillColor('#666').font('Helvetica').fontSize(10).text(dati.nomeBus, pos.x, doc.y, { width: pos.larghezza });
        }
      } else if (sezione === 'passeggero') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PASSEGGER' + (dati.passeggeriNomi.length > 1 ? 'I' : 'O'), pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica').fontSize(12).text(dati.passeggeriNomi.join('\n'), pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'pnr') {
        doc.fillColor(colore).font('Helvetica-Bold').fontSize(10).text('PNR', pos.x, pos.y, { width: pos.larghezza });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(16).text(dati.pnr, pos.x, doc.y, { width: pos.larghezza });
      } else if (sezione === 'qr') {
        const qrBuffer = Buffer.from(dati.qrDataUrl.split(',')[1], 'base64');
        // La dimensione arriva da qui — dalla stessa larghezza/altezza
        // trascinata sul canvas come ogni altro elemento — non più dal
        // campo numerico separato "config.qr.dimensione" (che con lo
        // scorrere del tempo si era scollegato: ridimensionare il QR
        // col mouse cambiava solo l'anteprima, mai il PDF vero). Il QR
        // resta sempre un quadrato — se il trascinamento lo ha reso un
        // rettangolo, si usa il lato più corto, altrimenti risulterebbe
        // deformato e più difficile da scansionare.
        const dim = Math.min(pos.larghezza, pos.altezza);
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
