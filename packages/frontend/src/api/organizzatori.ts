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
};
