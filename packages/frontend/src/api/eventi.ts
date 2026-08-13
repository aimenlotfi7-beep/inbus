import { api } from './client';
import type { Evento, OpzionePartenza } from './types';

export interface FermataInput {
  citta: string; indirizzo: string; orario?: string; orarioRitorno?: string; indirizzoRitorno?: string; prezzo?: number;
}
export interface LineaInput {
  nome: string; postiTotali: number; prezzoExtra?: number; referenteNome?: string; referenteTelefono?: string; fornitoreId?: string; fermate: FermataInput[];
}
export interface EventoInput {
  artista: string; genere: string; luogo: string; citta: string; data: string; prezzo: number;
  inEvidenza?: boolean; ordineEvidenza?: number; immagini?: string[]; allegati?: { nome: string; url: string }[]; linee?: LineaInput[];
}

export const eventiApi = {
  list: (filtri?: { citta?: string; genere?: string }) => {
    const query = new URLSearchParams(filtri as Record<string, string>).toString();
    return api.get<Evento[]>(`/api/eventi${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Evento>(`/api/eventi/${id}`),
  opzioniPartenza: (id: string) => api.get<OpzionePartenza[]>(`/api/eventi/${id}/opzioni-partenza`),
  create: (input: EventoInput) => api.post<Evento>('/api/eventi', input),
  update: (id: string, input: Partial<EventoInput>) => api.put<Evento>(`/api/eventi/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/eventi/${id}`),
};
