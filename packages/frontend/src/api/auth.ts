import { api } from './client';

export interface SessioneAdmin {
  id: string;
  nome: string;
  email: string;
  ruoloId: string;
  ruoloNome: string | null;
  owner: boolean;
  /** Elenco di chiavi permesso, oppure ['*'] se owner (tutti i permessi,
   *  presenti e futuri). Usa la funzione haPermesso() qui sotto per
   *  controllare, così il caso '*' è gestito in automatico ovunque. */
  permessi: string[];
}

export interface AdminLoginResponse {
  token: string;
  admin: SessioneAdmin;
}

export const authApi = {
  loginAdmin: (email: string, password: string) =>
    api.post<AdminLoginResponse>('/api/auth/admin/login', { email, password }),
  richiediReset: (email: string) => api.post<{ ok: true }>('/api/auth/admin/richiedi-reset', { email }),
  resetPassword: (token: string, password: string) => api.post<{ ok: true }>('/api/auth/admin/reset-password', { token, password }),
  me: () => api.get<{ admin: SessioneAdmin }>('/api/auth/me'),
};

/** Vero se la sessione può eseguire un'azione protetta da `chiave`.
 *  Chi è owner (permessi === ['*']) può sempre tutto. */
export function haPermesso(sessione: SessioneAdmin | null, chiave: string): boolean {
  if (!sessione) return false;
  if (sessione.owner) return true;
  return sessione.permessi.includes(chiave);
}
