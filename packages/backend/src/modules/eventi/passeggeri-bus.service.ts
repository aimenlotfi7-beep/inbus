import PDFDocument from 'pdfkit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { busFisici, eventi, fermate, linee, partecipantiPrenotazione, prenotazioni, tourLeader, tragitti, utenti } from '../../db/schema.js';
import { ErroreApplicativo } from '../../shared/errors.js';
import { formattaData, formattaDataOra, leggiOrario, orarioLeggibile } from '../../shared/formato.js';

/** La lista dei passeggeri di UN bus (quelli che lo smistamento ha messo
 *  su quel bus), per il gestionale e per il tour leader, e il suo PDF. */

export interface PasseggeroBus {
  id: string; // il partecipante: è quello che si segna "salito"
  pnr: string;
  nome: string;
  cognome: string;
  fermata: string;
  orario: string | null;
  telefono: string | null;
  salito: boolean;
}

export interface SchedaBus {
  busId: string;
  riferimento: string;
  autistaNome: string | null;
  autistaTelefono: string | null;
  tourLeaderId: string | null;
  tourLeaderNome: string | null;
  tourLeaderTelefono: string | null;
  lineaNome: string;
  tragittoId: string;
  tragittoNome: string;
  eventoId: string;
  eventoArtista: string;
  eventoData: Date;
}

export function busNonTrovato() {
  return new ErroreApplicativo('Bus non trovato: potrebbe essere già stato rimosso.', 404, 'NON_TROVATO');
}

/** Bus con linea, tragitto, evento e tour leader. null se non esiste o se
 *  non è dentro nessuna linea (vecchio sistema). */
export async function leggiSchedaBus(busId: string): Promise<SchedaBus | null> {
  const [r] = await db.select({
    busId: busFisici.id, riferimento: busFisici.riferimento, autistaNome: busFisici.autistaNome, autistaTelefono: busFisici.autistaTelefono,
    tourLeaderId: busFisici.tourLeaderId, tlNome: tourLeader.nome, tlCognome: tourLeader.cognome, tlTelefono: tourLeader.telefono,
    lineaNome: linee.nome, tragittoId: tragitti.id, tragittoNome: tragitti.nome,
    eventoId: eventi.id, eventoArtista: eventi.artista, eventoData: eventi.data,
  }).from(busFisici)
    .innerJoin(linee, eq(linee.id, busFisici.lineaId))
    .innerJoin(tragitti, eq(tragitti.id, linee.tragittoId))
    .innerJoin(eventi, eq(eventi.id, tragitti.eventoId))
    .leftJoin(tourLeader, eq(tourLeader.id, busFisici.tourLeaderId))
    .where(eq(busFisici.id, busId)).limit(1);
  if (!r) return null;
  return {
    busId: r.busId, riferimento: r.riferimento, autistaNome: r.autistaNome, autistaTelefono: r.autistaTelefono,
    tourLeaderId: r.tourLeaderId,
    tourLeaderNome: r.tlNome ? `${r.tlNome} ${r.tlCognome ?? ''}`.trim() : null,
    tourLeaderTelefono: r.tlTelefono ?? null,
    lineaNome: r.lineaNome, tragittoId: r.tragittoId, tragittoNome: r.tragittoNome,
    eventoId: r.eventoId, eventoArtista: r.eventoArtista, eventoData: r.eventoData,
  };
}

/** Solo i partecipanti delle prenotazioni confermate assegnate a questo bus,
 *  in ordine di orario della fermata e poi di cognome. */
export async function passeggeriDelBus(busId: string, tragittoId: string): Promise<PasseggeroBus[]> {
  const righe = await db.select({
    id: prenotazioni.id, pnr: prenotazioni.pnr, fermataCitta: prenotazioni.fermataCitta, fermataOrario: prenotazioni.fermataOrario,
    telefono: utenti.telefono,
  }).from(prenotazioni)
    .innerJoin(utenti, eq(utenti.id, prenotazioni.utenteId))
    .where(and(eq(prenotazioni.busId, busId), eq(prenotazioni.stato, 'CONFERMATA')));
  if (righe.length === 0) return [];

  // L'orario ATTUALE della fermata (può cambiare dopo la vendita); quello
  // salvato sulla prenotazione solo di riserva.
  const orariAttuali = await db.select({ citta: fermate.citta, orario: fermate.orario }).from(fermate)
    .where(eq(fermate.tragittoId, tragittoId)).orderBy(asc(fermate.ordine));
  const orarioPerCitta = new Map<string, string | null>();
  for (const f of orariAttuali) if (!orarioPerCitta.has(f.citta)) orarioPerCitta.set(f.citta, f.orario);

  const perId = new Map(righe.map((r) => [r.id, r]));
  const partecipanti = await db.select().from(partecipantiPrenotazione)
    .where(inArray(partecipantiPrenotazione.prenotazioneId, [...perId.keys()]))
    .orderBy(asc(partecipantiPrenotazione.ordine));

  const elenco: PasseggeroBus[] = [];
  for (const pt of partecipanti) {
    const p = perId.get(pt.prenotazioneId);
    if (!p) continue;
    elenco.push({
      id: pt.id,
      pnr: p.pnr,
      nome: pt.nome,
      cognome: pt.cognome,
      fermata: p.fermataCitta,
      orario: orarioLeggibile(orarioPerCitta.get(p.fermataCitta)) ?? orarioLeggibile(p.fermataOrario),
      telefono: p.telefono || null,
      salito: pt.ticketUtilizzatoIl !== null,
    });
  }

  const minuti = (orario: string | null) => {
    const o = leggiOrario(orario);
    return o ? o.ore * 60 + o.minuti : Number.MAX_SAFE_INTEGER;
  };
  const alfabetico = (a: string, b: string) => a.localeCompare(b, 'it', { sensitivity: 'base' });
  return elenco.sort((a, b) => (minuti(a.orario) - minuti(b.orario))
    || alfabetico(a.cognome, b.cognome)
    || alfabetico(a.nome, b.nome)
    || a.pnr.localeCompare(b.pnr));
}

// Colonne della tabella: la somma fa la larghezza utile di un A4 con
// margini di 40 punti (515).
const COLONNE = [
  { titolo: '', larghezza: 22 },
  { titolo: 'Cognome e nome', larghezza: 146 },
  { titolo: 'Fermata', larghezza: 95 },
  { titolo: 'Orario', larghezza: 40 },
  { titolo: 'Telefono', larghezza: 88 },
  { titolo: 'PNR', larghezza: 86 },
  { titolo: 'Salito', larghezza: 38 },
];
const ALTEZZA_RIGA = 20;

// Caratteri che Helvetica (font standard dei PDF) conosce oltre al Latin-1.
const EXTRA_WINANSI = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Il font standard del PDF conosce solo i caratteri dell'Europa
 *  occidentale: una freccia ("Milano → Roma") diventa un trattino, gli
 *  altri caratteri sconosciuti un punto interrogativo, invece di simboli
 *  senza senso. */
function testoPdf(testo: string): string {
  return testo
    .replace(/\s*[→⟶➔➜⇒]\s*/gu, ' - ')
    .replace(/[^\t\n\r\x20-\x7e\xa0-\xff]/gu, (c) => (EXTRA_WINANSI.includes(c) ? c : '?'));
}

function tronca(doc: PDFKit.PDFDocument, testo: string, larghezza: number): string {
  const pulito = testoPdf(testo);
  if (doc.widthOfString(pulito) <= larghezza) return pulito;
  let corto = pulito;
  while (corto.length > 0 && doc.widthOfString(`${corto}…`) > larghezza) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

function contatto(nome: string | null, telefono: string | null): string {
  return [nome, telefono].filter((v) => v && v.trim()).join(' · ') || '—';
}

/** Disegna il PDF (nessuna lettura dal database). */
export function disegnaPdfPasseggeri(scheda: SchedaBus, passeggeri: PasseggeroBus[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Lista passeggeri - ${testoPdf(scheda.riferimento)}` } });
    const pezzi: Buffer[] = [];
    doc.on('data', (c: Buffer) => pezzi.push(c));
    doc.on('end', () => resolve(Buffer.concat(pezzi)));
    doc.on('error', reject);

    const x0 = doc.page.margins.left;
    const larghezza = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const fondoUtile = () => doc.page.height - doc.page.margins.bottom - 10;

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18).text('Lista passeggeri', x0, doc.page.margins.top, { width: larghezza });
    doc.fillColor('#666666').font('Helvetica').fontSize(9).text(`OnWay · aggiornata al ${formattaDataOra(new Date())}`, x0, doc.y, { width: larghezza });
    doc.moveDown(0.8);

    const dati: [string, string][] = [
      ['Evento', scheda.eventoArtista],
      ['Data', formattaData(scheda.eventoData)],
      ['Tragitto', scheda.tragittoNome],
      ['Linea', scheda.lineaNome],
      ['Bus (targa)', scheda.riferimento],
      ['Autista', contatto(scheda.autistaNome, scheda.autistaTelefono)],
      ['Tour leader', contatto(scheda.tourLeaderNome, scheda.tourLeaderTelefono)],
    ];
    for (const [etichetta, valore] of dati) {
      const y = doc.y;
      doc.fillColor('#666666').font('Helvetica').fontSize(10).text(etichetta, x0, y, { width: 90 });
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10).text(testoPdf(valore), x0 + 95, y, { width: larghezza - 95 });
      doc.moveDown(0.25);
    }

    const saliti = passeggeri.filter((p) => p.salito).length;
    doc.moveDown(0.5);
    doc.fillColor('#111111').font('Helvetica').fontSize(10).text(`Passeggeri: ${passeggeri.length} · Saliti: ${saliti}`, x0, doc.y, { width: larghezza });
    doc.moveDown(0.8);

    let y = doc.y;
    const intestazioneTabella = () => {
      doc.rect(x0, y, larghezza, ALTEZZA_RIGA).fill('#EEEEEE');
      doc.fillColor('#333333').font('Helvetica-Bold').fontSize(9);
      let x = x0;
      for (const colonna of COLONNE) {
        if (colonna.titolo) doc.text(tronca(doc, colonna.titolo, colonna.larghezza - 8), x + 4, y + 6, { width: colonna.larghezza - 8, lineBreak: false });
        x += colonna.larghezza;
      }
      y += ALTEZZA_RIGA;
    };

    if (passeggeri.length === 0) {
      doc.fillColor('#666666').font('Helvetica').fontSize(11).text('Nessun passeggero assegnato a questo bus.', x0, y, { width: larghezza });
    } else {
      intestazioneTabella();
      passeggeri.forEach((p, indice) => {
        if (y + ALTEZZA_RIGA > fondoUtile()) {
          doc.addPage();
          y = doc.page.margins.top;
          intestazioneTabella();
        }
        if (indice % 2 === 1) doc.rect(x0, y, larghezza, ALTEZZA_RIGA).fill('#F7F7F7');
        // La casella vuota da spuntare a penna.
        doc.lineWidth(0.8).strokeColor('#333333').rect(x0 + 6, y + 5, 10, 10).stroke();
        const valori = [`${p.cognome} ${p.nome}`, p.fermata, p.orario ?? '—', p.telefono ?? '—', p.pnr, p.salito ? 'Sì' : 'No'];
        doc.fillColor('#111111').font('Helvetica').fontSize(9);
        let x = x0 + COLONNE[0].larghezza;
        valori.forEach((valore, i) => {
          const colonna = COLONNE[i + 1];
          doc.text(tronca(doc, valore, colonna.larghezza - 8), x + 4, y + 6, { width: colonna.larghezza - 8, lineBreak: false });
          x += colonna.larghezza;
        });
        doc.moveTo(x0, y + ALTEZZA_RIGA).lineTo(x0 + larghezza, y + ALTEZZA_RIGA).lineWidth(0.3).strokeColor('#DDDDDD').stroke();
        y += ALTEZZA_RIGA;
      });
    }

    // Numero di pagina in basso a destra (il margine basso va azzerato un
    // istante, altrimenti PDFKit aprirebbe una pagina nuova per scriverci).
    const pagine = doc.bufferedPageRange();
    for (let i = 0; i < pagine.count; i++) {
      doc.switchToPage(pagine.start + i);
      const margineBasso = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor('#999999').font('Helvetica').fontSize(8)
        .text(`${testoPdf(scheda.riferimento)} · pagina ${i + 1} di ${pagine.count}`, x0, doc.page.height - margineBasso + 12, { width: larghezza, align: 'right', lineBreak: false });
      doc.page.margins.bottom = margineBasso;
    }
    doc.end();
  });
}

/** Il PDF A4 della lista: intestazione (evento, data, tragitto, linea, bus
 *  e targa, autista, tour leader) e tabella con la casella da spuntare. */
export async function generaPdfPasseggeriBus(busId: string): Promise<{ pdf: Buffer; nomeFile: string }> {
  const scheda = await leggiSchedaBus(busId);
  if (!scheda) throw busNonTrovato();
  const passeggeri = await passeggeriDelBus(busId, scheda.tragittoId);
  const pdf = await disegnaPdfPasseggeri(scheda, passeggeri);
  const nomeFile = `passeggeri-${scheda.riferimento}`.replace(/[^a-zA-Z0-9-]+/g, '-') + '.pdf';
  return { pdf, nomeFile };
}
