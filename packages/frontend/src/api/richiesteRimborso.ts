import { api } from './client';

export interface RichiestaRimborso {
  id: string;
  stato: 'IN_ATTESA' | 'APPROVATA' | 'RIFIUTATA';
  motivo: string | null;
  noteAdmin: string | null;
  richiestaIl: string;
  gestitaIl: string | null;
  pnr: string;
  prenotazioneTotale: string;
  clienteEmail: string;
  clienteNome: string | null;
  clienteCognome: string | null;
}

export const richiesteRimborsoApi = {
  list: () => api.get<RichiestaRimborso[]>('/api/richieste-rimborso'),
  approva: (id: string, noteAdmin?: string) => api.post<{ ok: true }>(`/api/richieste-rimborso/${id}/approva`, { noteAdmin }),
  rifiuta: (id: string, noteAdmin?: string) => api.post<{ ok: true }>(`/api/richieste-rimborso/${id}/rifiuta`, { noteAdmin }),
};
