import { api } from './client';

export interface Amministratore {
  id: string;
  nome: string;
  email: string;
  ruoloId: string;
  attivo: boolean;
}
export interface AmministratoreInput {
  nome: string; email: string; password?: string; ruoloId?: string; attivo?: boolean;
}
export interface LogRiga {
  id: string;
  azione: string;
  dettaglio: string | null;
  data: string;
}

export interface EccezionePermesso { chiave: string; concesso: boolean; }
export interface PermessiUtenza {
  ruoloOwner: boolean;
  permessiRuolo: string[]; // ['*'] se il ruolo è owner
  eccezioni: EccezionePermesso[];
  effettivi: string[]; // ['*'] se owner
}

export const amministratoriApi = {
  list: () => api.get<Amministratore[]>('/api/amministratori'),
  create: (input: AmministratoreInput) => api.post<Amministratore>('/api/amministratori', input),
  update: (id: string, input: Partial<AmministratoreInput>) => api.put<Amministratore>(`/api/amministratori/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/amministratori/${id}`),
  log: () => api.get<LogRiga[]>('/api/amministratori/log'),
  permessi: (id: string) => api.get<PermessiUtenza>(`/api/amministratori/${id}/permessi`),
  salvaPermessi: (id: string, eccezioni: EccezionePermesso[]) => api.put<{ ok: true }>(`/api/amministratori/${id}/permessi`, { eccezioni }),
};
