import { api } from './client';
import type { Evento, OpzionePartenza } from './types';

export interface FermataInput {
  citta: string; indirizzo: string; orario?: string; orarioRitorno?: string; indirizzoRitorno?: string; prezzo?: number;
}
export interface LineaInput {
  nome: string; postiTotali: number; prezzoExtra?: number; referenteNome?: string; referenteTelefono?: string; fornitoreId?: string; fermate: FermataInput[];
}
export interface EventoInput {
  artista: string; genere: string; luogo: string; citta: string; data: string; prezzo?: number;
  inEvidenza?: boolean; ordineEvidenza?: number; accontoEur?: number;
  statoDisponibilita?: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
  immagini?: string[]; allegati?: { nome: string; url: string }[]; linee?: LineaInput[];
}

export interface FermataConPasseggeri { fermataId: string; citta: string; passeggeri: number; }
export interface CalcoloBusLinea {
  lineaId: string;
  nome: string;
  postiTotali: number;
  capienzaPerBus: number;
  fermate: FermataConPasseggeri[];
  totalePasseggeri: number;
  busSuggeriti: number;
  coperta: boolean;
}
export interface BusFisico {
  id: string;
  fornitoreId: string | null;
  riferimento: string;
  autistaNome: string | null;
  autistaTelefono: string | null;
  note: string | null;
  lineeIds: string[];
}
export interface BusFisicoInput {
  fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; note?: string; lineeIds: string[];
}

export const eventiApi = {
  list: (filtri?: { citta?: string; genere?: string; ricerca?: string }) => {
    const query = new URLSearchParams(filtri as Record<string, string>).toString();
    return api.get<Evento[]>(`/api/eventi${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Evento>(`/api/eventi/${id}`),
  opzioniPartenza: (id: string) => api.get<OpzionePartenza[]>(`/api/eventi/${id}/opzioni-partenza`),
  create: (input: EventoInput) => api.post<Evento>('/api/eventi', input),
  update: (id: string, input: Partial<EventoInput>) => api.put<Evento>(`/api/eventi/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/eventi/${id}`),

  calcolaBus: (id: string) => api.get<CalcoloBusLinea[]>(`/api/eventi/${id}/calcola-bus`),
  impostaCopertura: (id: string, lineaId: string, coperta: boolean, noteCoperta?: string) =>
    api.put<{ ok: true }>(`/api/eventi/${id}/linee/${lineaId}/copertura`, { coperta, noteCoperta }),
  listaBus: (id: string) => api.get<BusFisico[]>(`/api/eventi/${id}/bus`),
  creaBus: (id: string, input: BusFisicoInput) => api.post<{ id: string }>(`/api/eventi/${id}/bus`, input),
  aggiornaBus: (id: string, busId: string, input: Partial<BusFisicoInput>) => api.put<{ ok: true }>(`/api/eventi/${id}/bus/${busId}`, input),
  rimuoviBus: (id: string, busId: string) => api.delete<void>(`/api/eventi/${id}/bus/${busId}`),
  allertePartenze: () => api.get<{ conteggio: number }>('/api/eventi/allerte-partenze'),
};
