import { tokenCliente } from '../features/clienteSessione';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ErroreClienteAuth extends Error {}

async function chiamata<T>(percorso: string, opzioni: RequestInit = {}, autenticata = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (autenticata) {
    const token = tokenCliente();
    if (!token) throw new ErroreClienteAuth('Devi accedere al tuo account.');
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${percorso}`, { ...opzioni, headers: { ...headers, ...opzioni.headers } });
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroreClienteAuth(dati.errore ?? 'Errore di rete.');
  return dati as T;
}

export interface DatiCliente {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string;
  telefono: string | null;
  creditoDisponibile: string;
  emailVerificata: boolean;
}

export const clienteAuthApi = {
  registrati: (input: { email: string; password: string; nome: string; cognome: string; telefono?: string; citta?: string }) =>
    chiamata<{ ok: true }>('/api/cliente-auth/registrati', { method: 'POST', body: JSON.stringify(input) }),

  login: (email: string, password: string) =>
    chiamata<{ token: string }>('/api/cliente-auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  verificaEmail: (token: string) =>
    chiamata<{ token: string }>(`/api/cliente-auth/verifica/${token}`),

  rimandaVerifica: (email: string) =>
    chiamata<{ ok: true }>('/api/cliente-auth/rimanda-verifica', { method: 'POST', body: JSON.stringify({ email }) }),

  me: () => chiamata<DatiCliente>('/api/cliente-auth/me', {}, true),
};
