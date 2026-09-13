import { tracciaAcquisto } from './metaPixel';
import { tracciaAcquistoGA4, tracciaAcquistoGoogleAds } from './googleAnalytics';

/** Un acquisto registrato, tracciato allo stesso modo da ogni canale
 *  (checkout, carrello, widget White Label, bundle del widget, lista
 *  d'attesa). Prima ognuno mandava un importo diverso (prezzo stimato nel
 *  browser, totale prima o dopo coupon e credito) e un codice diverso.
 *  - valore: il prezzo pieno delle prenotazioni calcolato dal server
 *    (totaleComplessivo: dopo offerta, bundle e coupon, prima del credito,
 *    anche con l'acconto), lo stesso che il server manda a Meta;
 *  - codice: il PNR per una prenotazione, l'id dell'ordine per il carrello;
 *  - eventIdMeta: quello già mandato al server, così Meta non conta due volte. */
export function tracciaAcquistoRegistrato(dati: { valore: number; codice: string; eventIdMeta?: string; nome?: string }) {
  tracciaAcquisto(dati.valore, dati.eventIdMeta ?? dati.codice);
  tracciaAcquistoGA4(dati.valore, dati.codice, dati.nome);
  tracciaAcquistoGoogleAds(dati.valore, dati.codice);
}

/** Il valore di una o più prenotazioni restituite dal server. */
export function valoreAcquisto(prenotazioni: { totaleComplessivo?: number | string; totale: string | number }[]): number {
  return prenotazioni.reduce((s, p) => s + Number(p.totaleComplessivo ?? p.totale), 0);
}
