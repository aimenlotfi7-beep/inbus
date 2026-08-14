import { api } from './client';

export interface Categoria { id: string; nome: string; }

export const categorieApi = {
  list: () => api.get<Categoria[]>('/api/categorie'),
  create: (nome: string) => api.post<Categoria>('/api/categorie', { nome }),
  remove: (id: string) => api.delete<void>(`/api/categorie/${id}`),
};
