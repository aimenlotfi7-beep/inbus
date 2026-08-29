import { api } from './client';

export interface MessaggioChat {
  id: string;
  eventoId: string;
  autore: 'CLIENTE' | 'ADMIN';
  nome: string;
  email: string | null;
  testo: string;
  letto: boolean;
  creatoIl: string;
}

export const chatApi = {
  perEvento: (eventoId: string) => api.get<MessaggioChat[]>(`/api/chat/by-evento/${eventoId}`),
  invia: (input: { eventoId: string; nome: string; testo: string }) =>
    api.post<MessaggioChat>('/api/chat', { ...input, autore: 'ADMIN' }),

  // Lato cliente (nessuna autenticazione admin richiesta)
  storicoCliente: (email: string) => api.get<MessaggioChat[]>(`/api/chat/by-email?email=${encodeURIComponent(email)}`),
  inviaCliente: (input: { eventoId: string; nome: string; email: string; testo: string }) =>
    api.post<MessaggioChat>('/api/chat', { ...input, autore: 'CLIENTE' }),
};
