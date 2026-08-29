import { api } from './client';

export interface Impostazione { chiave: string; valore: string; }

export const impostazioniApi = {
  list: () => api.get<Impostazione[]>('/api/impostazioni'),
  set: (chiave: string, valore: string) => api.put<{ ok: true }>(`/api/impostazioni/${chiave}`, { valore }),
};
