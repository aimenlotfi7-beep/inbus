import { api } from './client';
import type { Evento, OpzionePartenza } from './types';

export interface FermataInput {
  citta: string; indirizzo: string; orario?: string; orarioRitorno?: string; indirizzoRitorno?: string; prezzo?: number; postiMax?: number;
}
export interface TragittoInput {
  id?: string; // presente = tratta già esistente, assente = nuova
  servizioId?: string | null; // vuoto = tratta "libera", non appartiene a nessun servizio
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
  bozza?: boolean;
  descrizione?: string;
  descrizioneSeo?: string;
  ticketColoreAccento?: string;
  ticketImmagineSfondoUrl?: string;
  layoutBigliettoId?: string | null;
  immagini?: string[]; allegati?: { nome: string; url: string }[]; tragitti?: TragittoInput[];
  // I servizi (pacchetti bus distinti dentro lo stesso evento) — ognuno
  // con i propri tragitti annidati. Facoltativo: la maggior parte degli
  // eventi non ne ha bisogno.
  servizi?: { id?: string; nome: string; arrivoOrario?: string; tragitti: TragittoInput[] }[];
}

export interface FermataConPasseggeri { fermataId: string; citta: string; passeggeri: number; }
export interface CalcoloBusTragitto {
  tragittoId: string;
  servizioId: string | null;
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
  tragittiIds: string[];
}
export interface BusFisicoInput {
  fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string; tragittiIds: string[];
}
export interface PasseggeroBus { pnr: string; nome: string; cognome: string; fermata: string; telefono: string; email: string; }
export interface RiepilogoEconomicoTratta { tragittoId: string; nome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; }

export const eventiApi = {
  list: (filtri?: { citta?: string; genere?: string; ricerca?: string; soloFuturi?: boolean; soloVisibili?: boolean }) => {
    const query = new URLSearchParams(filtri as Record<string, string>).toString();
    return api.get<Evento[]>(`/api/eventi${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Evento>(`/api/eventi/${id}`),
  getBySlug: (slug: string) => api.get<Evento>(`/api/eventi/slug/${slug}`),
  opzioniPartenza: (id: string, servizioId?: string) =>
    api.get<OpzionePartenza[]>(`/api/eventi/${id}/opzioni-partenza${servizioId ? `?servizioId=${servizioId}` : ''}`),
  create: (input: EventoInput) => api.post<Evento>('/api/eventi', input),
  update: (id: string, input: Partial<EventoInput>) => api.put<Evento>(`/api/eventi/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/eventi/${id}`),

  calcolaBus: (id: string) => api.get<CalcoloBusTragitto[]>(`/api/eventi/${id}/calcola-bus`),
  listaBus: (id: string) => api.get<BusFisico[]>(`/api/eventi/${id}/bus`),
  creaBus: (id: string, input: BusFisicoInput) => api.post<{ id: string }>(`/api/eventi/${id}/bus`, input),
  aggiornaBus: (id: string, busId: string, input: Partial<BusFisicoInput>) => api.put<{ ok: true }>(`/api/eventi/${id}/bus/${busId}`, input),
  rimuoviBus: (id: string, busId: string) => api.delete<void>(`/api/eventi/${id}/bus/${busId}`),
  listaPasseggeriBus: (id: string, busId: string) => api.get<PasseggeroBus[]>(`/api/eventi/${id}/bus/${busId}/passeggeri`),
  riepilogoEconomico: (id: string) => api.get<RiepilogoEconomicoTratta[]>(`/api/eventi/${id}/riepilogo-economico`),
  allertePartenze: () => api.get<{ conteggio: number }>('/api/eventi/allerte-partenze'),
  allertePartenzePerEvento: () => api.get<Record<string, number>>('/api/eventi/allerte-partenze-per-evento'),
  statistichePerEvento: () => api.get<Record<string, { partecipanti: number; busCensiti: number }>>('/api/eventi/statistiche-per-evento'),
  cestino: {
    eventi: () => api.get<(Evento & { eliminatoIl: string })[]>('/api/eventi/cestino/eventi'),
    ripristinaEvento: (id: string) => api.post<{ ok: true }>(`/api/eventi/cestino/eventi/${id}/ripristina`),
    tratte: () => api.get<{ id: string; nome: string; eliminatoIl: string; eventoId: string; eventoArtista: string }[]>('/api/eventi/cestino/tratte'),
    ripristinaTratta: (id: string) => api.post<{ ok: true }>(`/api/eventi/cestino/tratte/${id}/ripristina`),
  },
};
