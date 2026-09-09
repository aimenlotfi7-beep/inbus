import { api } from './client';

export interface Impostazione { chiave: string; valore: string; }

export const impostazioniApi = {
  list: () => api.get<Impostazione[]>('/api/impostazioni'),
  set: (chiave: string, valore: string) => api.put<{ ok: true }>(`/api/impostazioni/${chiave}`, { valore }),
  metaPixelIdPubblico: () => api.get<{ pixelId: string | null }>('/api/impostazioni/pubblico/meta-pixel-id'),
  tracciamentoPubblico: () => api.get<{ pixelId: string | null; ga4Id: string | null; googleAdsId: string | null; googleAdsLabel: string | null }>('/api/impostazioni/pubblico/tracciamento'),
};
