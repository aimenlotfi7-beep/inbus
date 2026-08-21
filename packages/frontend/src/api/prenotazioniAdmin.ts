import { api } from './client';

export interface PrenotazioneRiga {
  id: string;
  pnr: string;
  passeggeri: number;
  totale: string;
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  metodoPagamento: string;
  saldoPagato: boolean;
  saldoPagatoIl: string | null;
  stato: 'CONFERMATA' | 'CANCELLATA';
  creataIl: string;
  eventoId: string;
  artista: string;
  clienteEmail: string;
  clienteNome: string;
  clienteCognome: string | null;
  clienteTelefono: string | null;
  partecipanti: { nome: string; cognome: string }[];
}

export interface FiltriPrenotazioni {
  eventoId?: string;
  stato?: 'CONFERMATA' | 'CANCELLATA';
  ricerca?: string;
}

export interface EventoConPrenotazioni { id: string; artista: string; genere: string; luogo: string; citta: string; data: string; immagine: string | null; }

export const prenotazioniAdminApi = {
  listAll: (filtri: FiltriPrenotazioni = {}) => {
    const query = new URLSearchParams(Object.entries(filtri).filter(([, v]) => v) as [string, string][]).toString();
    return api.get<PrenotazioneRiga[]>(`/api/prenotazioni${query ? `?${query}` : ''}`);
  },
  eventiConPrenotazioni: () => api.get<EventoConPrenotazioni[]>('/api/prenotazioni/eventi'),
  cancella: (pnr: string) => api.post<void>(`/api/prenotazioni/${pnr}/cancella`),
  eliminaDefinitivamente: (pnr: string) => api.delete<void>(`/api/prenotazioni/${pnr}`),
};
