import { api } from './client';

export interface InfoVariazione {
  descrizione: string;
  pnr: string;
  giaRisposto: string | null;
}

export const variazioniApi = {
  getByToken: (token: string) => api.get<InfoVariazione>(`/api/variazioni-risposte/${token}`),
  rispondi: (token: string, risposta: 'ACCETTATA' | 'RIMBORSO_RICHIESTO') =>
    api.post<{ ok: true }>(`/api/variazioni-risposte/${token}/rispondi`, { risposta }),
};

export interface Variazione {
  id: string;
  tragittoId: string;
  fermataDescrizione: string;
  descrizione: string;
  stato: 'IN_CORSO' | 'GESTITA';
  creataIl: string;
  totaleClienti: number;
  rispostoAccettato: number;
  rispostoRimborso: number;
  inAttesa: number;
}

export const variazioniAdminApi = {
  list: () => api.get<Variazione[]>('/api/variazioni'),
};
