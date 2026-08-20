import { api } from './client';

export interface TemplateEmail {
  chiave: string;
  nome: string;
  oggetto: string;
  corpo: string;
  aggiornatoIl: string;
  segnaposto: string[];
}

export const templateEmailApi = {
  list: () => api.get<TemplateEmail[]>('/api/template-email'),
  aggiorna: (chiave: string, input: { oggetto?: string; corpo?: string }) =>
    api.put<{ ok: true }>(`/api/template-email/${chiave}`, input),
};
