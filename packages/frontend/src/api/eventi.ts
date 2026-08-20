import { api } from './client';
import type { Evento, OpzionePartenza } from './types';

export interface FermataInput {
  citta: string; indirizzo: string; orario?: string; orarioRitorno?: string; indirizzoRitorno?: string; prezzo?: number; postiMax?: number;
}
export interface LineaInput {
  id?: string; // presente = tratta già esistente, assente = nuova
  nome: string; postiTotali: number; prezzoExtra?: number; referenteNome?: string; referenteTelefono?: string; fornitoreId?: string;
  fermate: FermataInput[];
}
export interface EventoInput {
  artista: string; genere: string; luogo: string; citta: string; data: string; prezzo?: number;
  slug?: string;
  inEvidenza?: boolean; ordineEvidenza?: number; accontoEur?: number;
  statoDisponibilita?: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
  // L'arrivo (destinazione + orario) è unico per l'evento e si applica a
  // tutte le sue tratte come ancora per il calcolo orari.
  arrivoIndirizzo?: string; arrivoOrario?: string;
  visibileSito?: boolean;
  descrizione?: string;
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
  postiBusCensiti: number;
}
export interface BusFisico {
  id: string;
  fornitoreId: string | null;
  riferimento: string;
  autistaNome: string | null;
  autistaTelefono: string | null;
  tourLeaderId: string | null;
  tourLeaderNome: string | null;
  costo: string | null;
  postiBus: number | null;
  note: string | null;
  lineeIds: string[];
}
export interface BusFisicoInput {
  fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string; lineeIds: string[];
}
export interface PasseggeroBus { pnr: string; nome: string; cognome: string; fermata: string; telefono: string; email: string; }
export interface RiepilogoEconomicoTratta { lineaId: string; nome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; }

export const eventiApi = {
  list: (filtri?: { citta?: string; genere?: string; ricerca?: string; soloFuturi?: boolean; soloVisibili?: boolean }) => {
    const query = new URLSearchParams(filtri as Record<string, string>).toString();
    return api.get<Evento[]>(`/api/eventi${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Evento>(`/api/eventi/${id}`),
  getBySlug: (slug: string) => api.get<Evento>(`/api/eventi/slug/${slug}`),
  opzioniPartenza: (id: string) => api.get<OpzionePartenza[]>(`/api/eventi/${id}/opzioni-partenza`),
  create: (input: EventoInput) => api.post<Evento>('/api/eventi', input),
  update: (id: string, input: Partial<EventoInput>) => api.put<Evento>(`/api/eventi/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/eventi/${id}`),

  calcolaBus: (id: string) => api.get<CalcoloBusLinea[]>(`/api/eventi/${id}/calcola-bus`),
  listaBus: (id: string) => api.get<BusFisico[]>(`/api/eventi/${id}/bus`),
  creaBus: (id: string, input: BusFisicoInput) => api.post<{ id: string }>(`/api/eventi/${id}/bus`, input),
  aggiornaBus: (id: string, busId: string, input: Partial<BusFisicoInput>) => api.put<{ ok: true }>(`/api/eventi/${id}/bus/${busId}`, input),
  rimuoviBus: (id: string, busId: string) => api.delete<void>(`/api/eventi/${id}/bus/${busId}`),
  listaPasseggeriBus: (id: string, busId: string) => api.get<PasseggeroBus[]>(`/api/eventi/${id}/bus/${busId}/passeggeri`),
  riepilogoEconomico: (id: string) => api.get<RiepilogoEconomicoTratta[]>(`/api/eventi/${id}/riepilogo-economico`),
  allertePartenze: () => api.get<{ conteggio: number }>('/api/eventi/allerte-partenze'),
};
