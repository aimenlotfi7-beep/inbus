import { api } from './client';

export interface Amministratore {
  id: string;
  nome: string;
  email: string;
  ruolo: 'AMMINISTRATORE' | 'OPERATORE' | 'COLLABORATORE';
  attivo: boolean;
}
export interface AmministratoreInput {
  nome: string; email: string; password?: string; ruolo?: Amministratore['ruolo']; attivo?: boolean;
}
export interface LogRiga {
  id: string;
  azione: string;
  dettaglio: string | null;
  data: string;
}

export const amministratoriApi = {
  list: () => api.get<Amministratore[]>('/api/amministratori'),
  create: (input: AmministratoreInput) => api.post<Amministratore>('/api/amministratori', input),
  update: (id: string, input: Partial<AmministratoreInput>) => api.put<Amministratore>(`/api/amministratori/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/amministratori/${id}`),
  log: () => api.get<LogRiga[]>('/api/amministratori/log'),
};
