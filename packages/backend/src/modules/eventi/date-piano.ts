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

/** Le date di un evento, già risolte: quella sua se c'è, altrimenti
 *  quella generale. Una sola funzione, usata ovunque serva saperlo. */
export async function datePiano(evento: { data: Date; decisionePianoIl: Date | null; fineVenditeIl: Date | null }): Promise<DatePiano> {
  const [giorniDecisione, giorniFineVendite] = await Promise.all([leggiGiorniDecisionePiano(), leggiGiorniFineVendite()]);
  return {
    decisione: evento.decisionePianoIl ?? giorniPrima(evento.data, giorniDecisione),
    // Zero giorni e nessuna data sull'evento: nessuna chiusura.
    fineVendite: evento.fineVenditeIl ?? (giorniFineVendite > 0 ? giorniPrima(evento.data, giorniFineVendite) : null),
    decisionePersonalizzata: evento.decisionePianoIl !== null,
    fineVenditePersonalizzata: evento.fineVenditeIl !== null,
  };
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
}

/** Le vendite sono chiuse per data? Senza una data di fine vendite non
 *  si chiude niente (l'interruttore "Ferma vendite" è un'altra cosa). */
export const venditeChiusePerData = (date: DatePiano, adesso = new Date()) =>
  date.fineVendite !== null && adesso >= date.fineVendite;
