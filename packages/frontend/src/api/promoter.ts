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
  // Di default vende TUTTI gli eventi (inclusi quelli creati dopo):
  // questa è la lista delle ECCEZIONI escluse, non degli abilitati.
  eventiEsclusi: string[];
}
export interface PromoterInput {
  nome: string; email: string; telefono?: string; password?: string;
  commissionePercentuale?: number; note?: string; eventiEsclusi?: string[];
}

export interface CouponPromoter {
  codice: string; scontoTipo: 'PERCENTUALE' | 'FISSO'; scontoValore: number;
  usiAttuali: number; usiMax: number | null; validoDal: string | null; validoAl: string | null; attivo: boolean;
  compensoTipo: 'PERCENTUALE' | 'FISSO' | null; compensoValore: number | null; compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null;
  commissionePercentualeDefault: number;
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
  richiediReset: (email: string) => api.post<{ ok: true }>('/api/promoter/richiedi-reset', { email }),
  resetPassword: (token: string, password: string) => api.post<{ ok: true }>('/api/promoter/reset-password', { token, password }),

  // Self-service: il promoter vede i propri dati col proprio token (salvato separatamente da quello admin)
  me: () => apiPromoter.get<Promoter>('/api/promoter/me'),
  meStatistiche: () => apiPromoter.get<{ numeroPrenotazioni: number; fatturato: number; commissione: number }>('/api/promoter/me/statistiche'),
  meStatistichePerEvento: () => apiPromoter.get<Record<string, { numeroPrenotazioni: number; fatturato: number; commissione: number }>>('/api/promoter/me/statistiche-per-evento'),
  meCoupon: () => apiPromoter.get<CouponPromoter[]>('/api/promoter/me/coupon'),
  meLink: (eventoId: string) => apiPromoter.get<{ codice: string; url: string }>(`/api/promoter/me/link/${eventoId}`),
  linkAdmin: (promoterId: string, eventoId: string) => api.get<{ codice: string; url: string }>(`/api/promoter/${promoterId}/link/${eventoId}`),
  // Pubblica — risolve il codice opaco di /p/:codice in "a quale evento porta".
  risolviLink: (codice: string) => api.get<{ eventoSlug: string }>(`/api/promoter/link/${codice}`),
};
