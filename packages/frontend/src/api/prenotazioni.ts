import { api, apiConToken } from './client';
import type { Prenotazione } from './types';

export interface CreaPrenotazionePayload {
  eventoId: string;
  tragittoId: string;
  fermataId: string;
  passeggeri: number;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  metodoPagamento: 'CARTA' | 'PAYPAL' | 'SATISPAY' | 'DA_CONCORDARE';
  couponCodice?: string;
  promoterCodice?: string;
  offertaId?: string;
  usaCredito?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  cliente: { email: string; nome: string; cognome: string; telefono: string };
  // Un modulo nome+cognome per ogni passeggero OLTRE al richiedente
  // (deve essere lungo esattamente passeggeri-1).
  partecipanti: { nome: string; cognome: string }[];
}

/** Esito di un ordine: quante email di conferma non sono partite (il sito lo dice). */
export interface EsitoOrdine {
  ordine: { id: string; totale: string };
  prenotazioni: Prenotazione[];
  emailConfermaNonInviate: number;
}

export interface DifferenzaSaldo {
  pnr: string;
  eventoId: string;
  artista: string;
  dataEvento: string | null;
  saldoPagato: boolean;
  accontoVersato: number;
  totaleReale: number;
  differenza: number;
}

export interface DettaglioPrenotazione extends Prenotazione {
  evento: { artista: string; genere: string; luogo: string; citta: string; data: string; slug: string } | null;
  partecipanti: { nome: string; cognome: string }[];
}

export const prenotazioniApi = {
  // Ora richiede l'accesso vero del cliente (non più anonimo) — usa il
  // suo token, non quello admin.
  crea: (payload: CreaPrenotazionePayload) => apiConToken('inbus_cliente_token').post<Prenotazione>('/api/prenotazioni', payload),
  /** Il carrello — più articoli insieme, un'unica conferma. Ogni
   *  articolo ha la stessa forma di una prenotazione singola (il
   *  server la ricalcola e la valida esattamente allo stesso modo). */
  creaOrdine: (articoli: CreaPrenotazionePayload[], bundleId?: string) =>
    apiConToken('inbus_cliente_token').post<EsitoOrdine>('/api/prenotazioni/ordine', { articoli, ...(bundleId && { bundleId }) }),
  /** D1(b) — stesso ordine di creaOrdine sopra, ma senza sessione: chi
   *  acquista fornisce la propria identità nel corpo della richiesta
   *  invece che nel token. Il server crea/riusa l'account "implicito"
   *  da solo. */
  creaOrdineOspite: (input: { email: string; nome: string; cognome: string; telefono?: string; citta?: string; dataNascita: string; articoli: CreaPrenotazionePayload[]; bundleId?: string }) =>
    api.post<EsitoOrdine & { invitoPasswordInviato: boolean }>('/api/prenotazioni/ordine-ospite', input),
  getSaldo: (pnr: string, email: string) => api.get<DifferenzaSaldo>(`/api/prenotazioni/${pnr}/saldo?email=${encodeURIComponent(email)}`),
  saldaResto: (pnr: string, email: string, couponCodice?: string) => api.post<Prenotazione & { emailConfermaInviata?: boolean }>(`/api/prenotazioni/${pnr}/salda`, { email, ...(couponCodice && { couponCodice }) }),
  dettaglioPerCliente: (pnr: string, email: string) =>
    api.get<DettaglioPrenotazione>(`/api/prenotazioni/${pnr}/dettaglio-cliente?email=${encodeURIComponent(email)}`),
};
