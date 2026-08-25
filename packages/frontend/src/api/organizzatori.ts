import { api, apiConToken } from './client';

const apiOrganizzatore = apiConToken('inbus_organizzatore_token');

export interface Organizzatore {
  id: string;
  nome: string;
  email: string;
  telefono: string | null;
  note: string | null;
  eventiAbilitati: string[];
}
export interface OrganizzatoreInput {
  nome: string; email: string; telefono?: string; password?: string;
  note?: string; eventiAbilitati?: string[];
}
export interface EventoAssegnato {
  id: string;
  artista: string;
  data: string;
  luogo: string;
  citta: string;
}

export interface RegolaCommissione {
  id: string;
  organizzatoreId: string;
  percentuale: string;
  validoDal: string;
  validoA: string | null;
}

export const commissioniApi = {
  get: (organizzatoreId: string) => api.get<{ attiva: RegolaCommissione | null; storico: RegolaCommissione[] }>(`/api/admin/commissioni/organizzatore/${organizzatoreId}`),
  imposta: (organizzatoreId: string, percentuale: number) => api.post<RegolaCommissione>(`/api/admin/commissioni/organizzatore/${organizzatoreId}`, { percentuale }),
};

export interface StatisticheGenerali {
  eventiAttivi: number;
  viaggiatori: number;
  fatturato: number;
  quotaOrganizzatore: number;
}
export interface StatisticaEvento {
  eventoId: string;
  eventoArtista: string;
  numeroPrenotazioni: number;
  viaggiatori: number;
  fatturato: number;
  quotaOrganizzatore: number;
}

export const organizzatoriApi = {
  list: () => api.get<Organizzatore[]>('/api/organizzatori'),
  create: (input: OrganizzatoreInput) => api.post<Organizzatore>('/api/organizzatori', input),
  update: (id: string, input: Partial<OrganizzatoreInput>) => api.put<Organizzatore>(`/api/organizzatori/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/organizzatori/${id}`),

  login: (email: string, password: string) =>
    api.post<{ token: string; organizzatore: { id: string; nome: string } }>('/api/organizzatori/login', { email, password }),
  richiediReset: (email: string) => api.post<{ ok: true }>('/api/organizzatori/richiedi-reset', { email }),
  resetPassword: (token: string, password: string) => api.post<{ ok: true }>('/api/organizzatori/reset-password', { token, password }),

  me: () => apiOrganizzatore.get<Organizzatore>('/api/organizzatori/me'),
  meEventi: () => apiOrganizzatore.get<EventoAssegnato[]>('/api/organizzatori/me/eventi'),
  meStatistiche: () => apiOrganizzatore.get<StatisticheGenerali>('/api/organizzatori/me/statistiche'),
  meStatistichePerEvento: () => apiOrganizzatore.get<StatisticaEvento[]>('/api/organizzatori/me/statistiche-per-evento'),
  statistiche: (id: string) => api.get<{ generali: StatisticheGenerali; perEvento: StatisticaEvento[] }>(`/api/organizzatori/${id}/statistiche`),
};
