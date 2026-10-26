import { leggiGiorniDecisionePiano, leggiGiorniFineVendite } from '../impostazioni/impostazioni.routes.js';
import { inizioGiornoRoma } from '../../shared/formato.js';

/** Le due date del piano bus di un evento (proprietario, ottobre 2026).
 *
 *  Un'unica regola per tutti i tragitti dell'evento:
 *  - fino alla DECISIONE si raccolgono le prenotazioni e non si prende
 *    nessun impegno (le richieste di preventivo per i bus non partono);
 *  - alla DECISIONE il sistema costruisce il piano e le richieste partono;
 *  - alla FINE VENDITE non si compra più, ma la lista d'attesa resta aperta.
 *
 *  Ogni evento può avere le sue date; se non le ha valgono i giorni
 *  impostati in Impostazioni, contati all'indietro dal giorno
 *  dell'evento (mezzanotte di Roma, come tutte le date degli eventi). */

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

export interface DatePiano {
  decisione: Date;
  /** null = nessuna chiusura anticipata: si vende fino a tutto il
   *  giorno dell'evento (nessun giorno impostato e nessuna data
   *  sull'evento). */
  fineVendite: Date | null;
  /** Se la data arriva dall'evento invece che dalle impostazioni. */
  decisionePersonalizzata: boolean;
  fineVenditePersonalizzata: boolean;
}

type EventoConDate = { data: Date; decisionePianoIl: Date | null; fineVenditeIl: Date | null };

/** Le date di un evento, già risolte: quella sua se c'è, altrimenti
 *  quella generale. Una sola funzione, usata ovunque serva saperlo. */
export async function datePiano(evento: EventoConDate): Promise<DatePiano> {
  const [giorniDecisione, giorniFineVendite] = await Promise.all([leggiGiorniDecisionePiano(), leggiGiorniFineVendite()]);
  return risolviDatePiano(evento, giorniDecisione, giorniFineVendite);
}

/** Come datePiano, con i giorni delle Impostazioni già letti: per gli
 *  elenchi con tanti eventi (Partenze), che li leggono una volta sola. */
export function risolviDatePiano(evento: EventoConDate, giorniDecisione: number, giorniFineVendite: number): DatePiano {
  return {
    decisione: evento.decisionePianoIl ?? giorniPrima(evento.data, giorniDecisione),
    // Zero giorni e nessuna data sull'evento: nessuna chiusura.
    fineVendite: evento.fineVenditeIl ?? (giorniFineVendite > 0 ? giorniPrima(evento.data, giorniFineVendite) : null),
    decisionePersonalizzata: evento.decisionePianoIl !== null,
    fineVenditePersonalizzata: evento.fineVenditeIl !== null,
  };
}

/** La data di decisione è stata scritta da «Crea piano»? «Crea piano»
 *  salva l'istante della conferma; la scheda dell'evento salva un giorno
 *  intero (mezzanotte UTC, dal campo data). Serve solo a dire nel
 *  gestionale da dove arriva la data. */
export function decisioneDaCreaPiano(decisionePianoIl: Date | null): boolean {
  if (!decisionePianoIl) return false;
  return decisionePianoIl.getUTCHours() !== 0 || decisionePianoIl.getUTCMinutes() !== 0
    || decisionePianoIl.getUTCSeconds() !== 0 || decisionePianoIl.getUTCMilliseconds() !== 0;
}

/** Mezzanotte (ora di Roma) di `giorni` giorni prima della data dell'evento. */
export function giorniPrima(dataEvento: Date, giorni: number): Date {
  return inizioGiornoRoma(new Date(dataEvento.getTime() - giorni * UN_GIORNO_MS));
}

/** Il piano si decide da adesso in poi? */
export const decisioneArrivata = (date: DatePiano, adesso = new Date()) => adesso >= date.decisione;

/** Le date del piano viste dal gestionale: la pagina delle linee le mostra
 *  per spiegare perché le richieste non sono ancora partite (proprietario,
 *  ottobre 2026: un solo meccanismo, la data, e si deve vedere). Qui non si
 *  legge il database: questo modulo resta puro (ha i test senza database). */
export interface DatePianoViste extends DatePiano {
  decisioneArrivata: boolean;
  /** La data l'ha anticipata «Crea piano» (non la scheda dell'evento). */
  decisioneDaCreaPiano: boolean;
}

/** Le vendite sono chiuse per data? Senza una data di fine vendite non
 *  si chiude niente (l'interruttore "Ferma vendite" è un'altra cosa). */
export const venditeChiusePerData = (date: DatePiano, adesso = new Date()) =>
  date.fineVendite !== null && adesso >= date.fineVendite;
