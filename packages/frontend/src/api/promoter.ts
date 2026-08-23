import { api, apiConToken } from './client';

const apiPromoter = apiConToken('inbus_promoter_token');

export interface Promoter {
  id: string;
  nome: string;
  email: string;
  telefono: string | null;
  codice: string;
  commissionePercentuale: string;
  note: string | null;
  eventiAbilitati: string[];
}
export interface PromoterInput {
  nome: string; email: string; telefono?: string; password?: string;
  commissionePercentuale?: number; note?: string; eventiAbilitati?: string[];
}

export const promoterApi = {
  list: () => api.get<Promoter[]>('/api/promoter'),
  create: (input: PromoterInput) => api.post<Promoter>('/api/promoter', input),
  update: (id: string, input: Partial<PromoterInput>) => api.put<Promoter>(`/api/promoter/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/promoter/${id}`),
  statistiche: (id: string) => api.get<{ numeroPrenotazioni: number; fatturato: number }>(`/api/promoter/${id}/statistiche`),

  // Pubblico: login del promoter stesso (nessuna autenticazione admin)
  login: (email: string, password: string) =>
    api.post<{ token: string; promoter: { id: string; nome: string; codice: string } }>('/api/promoter/login', { email, password }),

  // Self-service: il promoter vede i propri dati col proprio token (salvato separatamente da quello admin)
  me: () => apiPromoter.get<Promoter>('/api/promoter/me'),
  meStatistiche: () => apiPromoter.get<{ numeroPrenotazioni: number; fatturato: number }>('/api/promoter/me/statistiche'),
  meStatistichePerEvento: () => apiPromoter.get<Record<string, { numeroPrenotazioni: number; fatturato: number }>>('/api/promoter/me/statistiche-per-evento'),
};
