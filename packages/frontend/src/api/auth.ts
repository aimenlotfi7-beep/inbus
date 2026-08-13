import { api } from './client';

export interface AdminLoginResponse {
  token: string;
  admin: { id: string; nome: string; email: string; ruolo: 'AMMINISTRATORE' | 'OPERATORE' | 'COLLABORATORE' };
}

export const authApi = {
  loginAdmin: (email: string, password: string) =>
    api.post<AdminLoginResponse>('/api/auth/admin/login', { email, password }),
};
