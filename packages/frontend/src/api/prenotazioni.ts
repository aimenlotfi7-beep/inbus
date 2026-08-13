import { api } from './client';
import type { Prenotazione } from './types';

export interface CreaPrenotazionePayload {
  eventoId: string;
  lineaId: string;
  fermataId: string;
  passeggeri: number;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  metodoPagamento: 'CARTA' | 'PAYPAL' | 'SATISPAY' | 'DA_CONCORDARE';
  couponCodice?: string;
  promoterCodice?: string;
  cliente: { email: string; nome: string; cognome?: string; telefono?: string };
}

export const prenotazioniApi = {
  crea: (payload: CreaPrenotazionePayload) => api.post<Prenotazione>('/api/prenotazioni', payload),
  getByPnr: (pnr: string) => api.get<Prenotazione>(`/api/prenotazioni/${pnr}`),
  listByEmail: (email: string) => api.get<Prenotazione[]>(`/api/prenotazioni/by-email?email=${encodeURIComponent(email)}`),
  cancella: (pnr: string) => api.post<Prenotazione>(`/api/prenotazioni/${pnr}/cancella`),
};
