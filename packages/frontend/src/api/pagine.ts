import { api } from './client';

export interface PaginaCms { chiave: string; titolo: string; contenuto: string; }
export interface ContenutoSito { chiave: string; valore: string; }

export const pagineApi = {
  list: () => api.get<PaginaCms[]>('/api/pagine'),
  getByChiave: (chiave: string) => api.get<PaginaCms>(`/api/pagine/${chiave}`),
  upsert: (chiave: string, dati: { titolo: string; contenuto: string }) => api.put<PaginaCms>(`/api/pagine/${chiave}`, dati),
  listContenuti: () => api.get<ContenutoSito[]>('/api/contenuti'),
  upsertContenuto: (chiave: string, valore: string) => api.put<void>(`/api/contenuti/${chiave}`, { valore }),
};
