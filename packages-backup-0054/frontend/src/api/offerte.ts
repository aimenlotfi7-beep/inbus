import { api } from './client';
import type { Evento } from './types';

export interface Offerta {
  id: string;
  eventoId: string;
  campagnaId: string | null;
  nome: string;
  slug: string;
  scontoPercentuale: string;
  attiva: boolean;
  validoDal: string | null;
  validoAl: string | null;
  limiteUtilizzi: number | null;
  utilizzi: number;
  creataIl: string;
}

export interface OffertaInput {
  eventoId: string;
  campagnaId?: string;
  nome: string;
  slug: string;
  scontoPercentuale: number;
  attiva?: boolean;
  validoDal?: string;
  validoAl?: string;
  limiteUtilizzi?: number;
}

export const offerteApi = {
  listByEvento: (eventoId: string) => api.get<Offerta[]>(`/api/offerte/evento/${eventoId}`),
  create: (input: OffertaInput) => api.post<Offerta>('/api/offerte', input),
  update: (id: string, input: Partial<OffertaInput>) => api.put<Offerta>(`/api/offerte/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/offerte/${id}`),
  // Pubblico: usato dalla pagina /offerta/:slug del sito
  getBySlug: (slug: string) => api.get<{ offerta: Offerta; evento: Evento }>(`/api/offerte/pubblica/${slug}`),
};
