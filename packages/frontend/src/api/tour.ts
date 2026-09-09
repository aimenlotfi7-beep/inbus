import { api } from './client';

export interface TourRiga {
  id: string; nome: string; slug: string; copertinaUrl: string | null; numeroEventi: number;
}
export interface TourInput {
  nome: string; slug?: string; copertinaUrl?: string | null; eventiIds: string[];
}
export interface TourDettaglio {
  id: string; nome: string; slug: string; copertinaUrl: string | null;
  eventi: { id: string; artista: string; data: string; citta: string; luogo: string; slug: string; eliminato: boolean }[];
}
export interface DataDelTour {
  id: string; slug: string; artista: string; data: string; citta: string; luogo: string;
  immagineUrl: string | null; prezzoMinimo: number | null; vendibile: boolean;
}
export interface TourPubblico {
  nome: string; slug: string; copertinaUrl: string | null; eventi: DataDelTour[];
}

export const tourApi = {
  list: () => api.get<TourRiga[]>('/api/tour'),
  dettaglio: (id: string) => api.get<TourDettaglio>(`/api/tour/${id}`),
  create: (input: TourInput) => api.post<{ id: string }>('/api/tour', input),
  update: (id: string, input: TourInput) => api.put<{ id: string }>(`/api/tour/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/tour/${id}`),
  dettaglioPubblico: (slug: string) => api.get<TourPubblico>(`/api/tour/pubblico/${slug}`),
};
