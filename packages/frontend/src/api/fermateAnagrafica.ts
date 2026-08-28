import { api } from './client';

export interface FermataAnagrafica {
  id: string;
  nome: string;
  citta: string;
  indirizzo: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  link: string | null;
}

export interface FermataAnagraficaInput {
  nome: string;
  citta: string;
  indirizzo: string;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  link?: string | null;
}

export const fermateAnagraficaApi = {
  list: () => api.get<FermataAnagrafica[]>('/api/fermate-anagrafica'),
  create: (input: FermataAnagraficaInput) => api.post<FermataAnagrafica>('/api/fermate-anagrafica', input),
  update: (id: string, input: FermataAnagraficaInput) => api.put<FermataAnagrafica>(`/api/fermate-anagrafica/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/fermate-anagrafica/${id}`),
};
