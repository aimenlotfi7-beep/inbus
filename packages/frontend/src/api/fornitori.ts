import { api } from './client';

export interface Fornitore {
  id: string;
  nome: string;
  partitaIva: string | null;
  referente: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  note: string | null;
}
export type FornitoreInput = Omit<Fornitore, 'id'>;

export const fornitoriApi = {
  list: () => api.get<Fornitore[]>('/api/fornitori'),
  create: (input: Partial<FornitoreInput>) => api.post<Fornitore>('/api/fornitori', input),
  update: (id: string, input: Partial<FornitoreInput>) => api.put<Fornitore>(`/api/fornitori/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/fornitori/${id}`),
};
