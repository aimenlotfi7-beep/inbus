import { api } from './client';

export interface FermataTragitto {
  id?: string;
  citta: string;
  indirizzo: string;
  prezzo?: number;
}
export interface Tragitto {
  id: string;
  nome: string;
  fermate: FermataTragitto[];
}
export type TragittoInput = { nome: string; fermate: FermataTragitto[] };

export const tragittiApi = {
  list: () => api.get<Tragitto[]>('/api/tragitti'),
  getById: (id: string) => api.get<Tragitto>(`/api/tragitti/${id}`),
  create: (input: TragittoInput) => api.post<Tragitto>('/api/tragitti', input),
  update: (id: string, input: Partial<TragittoInput>) => api.put<Tragitto>(`/api/tragitti/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/tragitti/${id}`),
};
