import { api } from './client';

export interface Campagna {
  id: string;
  nome: string;
  piattaforma: string | null;
  tipo: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  attiva: boolean;
  creataIl: string;
}

export interface CampagnaInput {
  nome: string;
  piattaforma?: string;
  tipo?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  attiva?: boolean;
}

export const campagneApi = {
  list: () => api.get<Campagna[]>('/api/campagne'),
  create: (input: CampagnaInput) => api.post<Campagna>('/api/campagne', input),
  update: (id: string, input: Partial<CampagnaInput>) => api.put<Campagna>(`/api/campagne/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/campagne/${id}`),
};
