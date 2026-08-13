import { api } from './client';

export interface Utente {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string;
  telefono: string | null;
  citta: string | null;
  creatoIl: string;
}

export const utentiApi = {
  list: () => api.get<Utente[]>('/api/utenti'),
  getById: (id: string) => api.get<Utente>(`/api/utenti/${id}`),
};
