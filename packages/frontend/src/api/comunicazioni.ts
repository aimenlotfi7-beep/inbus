import { api } from './client';

export interface Comunicazione {
  id: string;
  eventoId: string;
  oggetto: string;
  corpo: string;
  filtroServizioIds: string[];
  filtroTragittoId: string | null;
  filtroFermataId: string | null;
  canali: ('EMAIL' | 'CHAT')[];
  numeroDestinatari: number;
  creataIl: string;
}
export interface FiltroDestinatari {
  servizioIds?: string[];
  tragittoId?: string;
  fermataId?: string;
}
export interface FermataTragitto {
  id: string;
  citta: string;
  indirizzo: string;
}

export const comunicazioniApi = {
  list: (eventoId: string) => api.get<Comunicazione[]>(`/api/comunicazioni/evento/${eventoId}`),
  anteprima: (eventoId: string, filtro: FiltroDestinatari) => {
    const query = new URLSearchParams();
    if (filtro.servizioIds?.length) query.set('servizioIds', filtro.servizioIds.join(','));
    if (filtro.tragittoId) query.set('tragittoId', filtro.tragittoId);
    if (filtro.fermataId) query.set('fermataId', filtro.fermataId);
    return api.get<{ numeroDestinatari: number }>(`/api/comunicazioni/evento/${eventoId}/anteprima?${query.toString()}`);
  },
  invia: (eventoId: string, input: FiltroDestinatari & { oggetto: string; corpo: string; canali: ('EMAIL' | 'CHAT')[] }) =>
    api.post<Comunicazione>(`/api/comunicazioni/evento/${eventoId}`, input),
  fermateTragitto: (tragittoId: string) => api.get<FermataTragitto[]>(`/api/comunicazioni/tragitto/${tragittoId}/fermate`),
};
