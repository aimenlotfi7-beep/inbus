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
  fineVendite: Date;
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
    fineVendite: evento.fineVenditeIl ?? giorniPrima(evento.data, giorniFineVendite),
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

/** Le vendite sono chiuse per data? (l'interruttore "Ferma vendite" è un'altra cosa) */
export const venditeChiusePerData = (date: DatePiano, adesso = new Date()) => adesso >= date.fineVendite;
