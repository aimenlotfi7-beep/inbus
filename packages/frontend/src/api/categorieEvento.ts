import { api } from './client';

export interface CategoriaEvento { id: string; nome: string; }

export const categorieEventoApi = {
  list: () => api.get<CategoriaEvento[]>('/api/categorie-evento'),
  create: (nome: string) => api.post<CategoriaEvento>('/api/categorie-evento', { nome }),
  remove: (id: string) => api.delete<void>(`/api/categorie-evento/${id}`),
};
