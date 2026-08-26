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
  creaOrdine: (articoli: CreaPrenotazionePayload[]) =>
    apiConToken('inbus_cliente_token').post<{ ordine: { id: string; totale: string }; prenotazioni: Prenotazione[] }>('/api/prenotazioni/ordine', { articoli }),
  getSaldo: (pnr: string) => api.get<DifferenzaSaldo>(`/api/prenotazioni/${pnr}/saldo`),
  saldaResto: (pnr: string, couponCodice?: string) => api.post<Prenotazione>(`/api/prenotazioni/${pnr}/salda`, couponCodice ? { couponCodice } : undefined),
  getByPnr: (pnr: string) => api.get<Prenotazione>(`/api/prenotazioni/${pnr}`),
  listByEmail: (email: string) => api.get<Prenotazione[]>(`/api/prenotazioni/by-email?email=${encodeURIComponent(email)}`),
  dettaglioPerCliente: (pnr: string, email: string) =>
    api.get<DettaglioPrenotazione>(`/api/prenotazioni/${pnr}/dettaglio-cliente?email=${encodeURIComponent(email)}`),
};
