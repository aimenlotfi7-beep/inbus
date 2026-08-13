import { api } from './client';

export interface PrenotazioneRiga {
  id: string;
  pnr: string;
  passeggeri: number;
  totale: string;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  metodoPagamento: string;
  saldoPagato: boolean;
  stato: 'CONFERMATA' | 'CANCELLATA';
  creataIl: string;
  artista: string;
  clienteEmail: string;
  clienteNome: string | null;
}

export const prenotazioniAdminApi = {
  listAll: () => api.get<PrenotazioneRiga[]>('/api/prenotazioni'),
  cancella: (pnr: string) => api.post<void>(`/api/prenotazioni/${pnr}/cancella`),
};
