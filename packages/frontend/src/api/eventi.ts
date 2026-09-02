import { api } from './client';
import type { Evento, OpzionePartenza } from './types';

export interface FermataInput {
  fermataAnagraficaId?: string | null;
  citta: string; indirizzo?: string | null; orario?: string; orarioRitorno?: string; indirizzoRitorno?: string; prezzo?: number; postiMax?: number;
  sogliaMinima?: number | null; attivo?: boolean;
}
export interface TragittoInput {
  id?: string; // presente = tratta già esistente, assente = nuova
  servizioId?: string | null; // vuoto = tratta "libera", non appartiene a nessun servizio
  nome: string; postiTotali: number; prezzoExtra?: number; attivo?: boolean; referenteNome?: string; referenteTelefono?: string; fornitoreId?: string;
  // Deciso qui in Eventi — non più da Partenze.
  arrivoIndirizzo?: string;
  arrivoOrario?: string;
  arrivoCitta?: string;
  fermate: FermataInput[];
}
export interface EventoInput {
  artista: string; genere: string; categoria?: string | null; luogo: string; citta: string; data: string; prezzo?: number;
  slug?: string;
  inEvidenza?: boolean; ordineEvidenza?: number; accontoEur?: number;
  statoDisponibilita?: 'POCHI_POSTI' | 'NUOVI_POSTI' | 'ESAURITO' | null;
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
  servizi?: { id?: string; nome: string; tragitti: TragittoInput[] }[];
}

export interface FermataConPasseggeri { fermataId: string; citta: string; passeggeri: number; }
export interface CalcoloBusTragitto {
  tragittoId: string;
  servizioId: string | null;
  nome: string;
  stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO';
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
  fermateIds: string[];
}
export interface LineaInput {
  fornitoreId?: string; riferimento: string; autistaNome?: string; autistaTelefono?: string; tourLeaderId?: string | null; costo?: number; postiBus?: number; note?: string; fermateIds: string[];
}
// Aggiungere un bus a una Linea esistente, o modificare un bus già
// dentro — mai le fermate, quelle sono della Linea intera.
export type BusDiLineaInput = Omit<LineaInput, 'fermateIds'>;
export interface FermataLinea { fermataId: string; citta: string; orario: string | null; inAttesa: number; versati: number; }
export interface BusDiLinea {
  id: string; fornitoreId: string | null; riferimento: string; autistaNome: string | null; autistaTelefono: string | null;
  tourLeaderId: string | null; tourLeaderNome: string | null; costo: string | null; postiBus: number | null; note: string | null;
}
export interface Linea { id: string; nome: string; fermate: FermataLinea[]; bus: BusDiLinea[]; }
export interface PasseggeroBus { pnr: string; nome: string; cognome: string; fermata: string; telefono: string; email: string; }
export interface RiepilogoEconomicoLinea { lineaId: string; lineaNome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; }
export interface RiepilogoEconomicoTratta { tragittoId: string; nome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; perLinea: RiepilogoEconomicoLinea[]; }
export interface VenditePerFermata {
  perFermata: { citta: string; confermati: number }[];
  andamento: { data: string; citta: string; cumulativo: number }[];
}

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

  creaLinea: (id: string, input: LineaInput) => api.post<{ lineaId: string; busId: string }>(`/api/eventi/${id}/linee`, input),
  aggiungiBusALinea: (lineaId: string, input: BusDiLineaInput) => api.post<{ id: string }>(`/api/eventi/linee/${lineaId}/bus`, input),
  aggiornaPercorsoLinea: (eventoId: string, lineaId: string, fermateIds: string[]) => api.put<{ ok: true }>(`/api/eventi/${eventoId}/linee/${lineaId}/percorso`, { fermateIds }),
  aggiornaBusDiLinea: (busId: string, input: Partial<BusDiLineaInput>) => api.put<{ ok: true }>(`/api/eventi/linee/bus/${busId}`, input),
  listaLinee: (tragittoId: string) => api.get<Linea[]>(`/api/eventi/tragitti/${tragittoId}/linee`),
  versaLinea: (lineaId: string) => api.post<{ versate: number; restanoInAttesa: number }>(`/api/eventi/linee/${lineaId}/versa`, {}),
  // Fase 2 — orario/prezzo/posti si modificano da Partenze, non più da
  // Eventi. aggiornaServizio esisteva già lato backend (mai usata dal
  // frontend finora) — qui il client mancante.

  aggiornaTragittoOperativo: (tragittoId: string, input: { prezzoExtra?: number; fermate: FermataInput[] }) =>
    api.put<{ ok: true }>(`/api/eventi/tragitti/${tragittoId}/operativo`, input),
  registraPreventivo: (tragittoId: string, input: { preventivoCosto: number; preventivoPostiBus: number; prezziPerFermata: { fermataId: string; prezzo: number }[] }) =>
    api.put<{ ok: true }>(`/api/eventi/tragitti/${tragittoId}/preventivo`, input),
  rimuoviBus: (id: string, busId: string) => api.delete<void>(`/api/eventi/${id}/bus/${busId}`),
  listaPasseggeriBus: (id: string, busId: string) => api.get<PasseggeroBus[]>(`/api/eventi/${id}/bus/${busId}/passeggeri`),
  riepilogoEconomico: (id: string) => api.get<RiepilogoEconomicoTratta[]>(`/api/eventi/${id}/riepilogo-economico`),
  venditePerFermata: (tragittoId: string) => api.get<VenditePerFermata>(`/api/eventi/tragitti/${tragittoId}/vendite`),
  allertePartenze: () => api.get<{ conteggio: number }>('/api/eventi/allerte-partenze'),
  eventiDaCalcolareOrari: () => api.get<{ conteggio: number }>('/api/eventi/eventi-da-calcolare-orari'),
  eventiDaPrezzare: () => api.get<{ conteggio: number }>('/api/eventi/eventi-da-prezzare'),
  eventiDaCostruireLinee: () => api.get<{ conteggio: number }>('/api/eventi/eventi-da-costruire-linee'),
  allertePartenzePerEvento: () => api.get<Record<string, number>>('/api/eventi/allerte-partenze-per-evento'),
  elencoPartenze: () => api.get<Array<{
    tragittoId: string; tragittoNome: string;
    stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO';
    postiTotali: number; totalePasseggeri: number;
    preventivoCosto: string | null; fermateCompilate: boolean; servizioNome: string | null; servizioId: string | null;
    evento: { id: string; artista: string; genere: string; data: string; citta: string; luogo: string; slug: string; immagineUrl: string | null };
  }>>('/api/eventi/elenco-partenze'),
  statistichePerEvento: () => api.get<Record<string, { partecipanti: number; busCensiti: number }>>('/api/eventi/statistiche-per-evento'),
  tragittoHaPrenotazioniConfermate: (tragittoId: string) => api.get<{ haPrenotazioni: boolean; quante: number }>(`/api/eventi/tragitti/${tragittoId}/prenotazioni-confermate`),
  cestino: {
    eventi: () => api.get<(Evento & { eliminatoIl: string })[]>('/api/eventi/cestino/eventi'),
    ripristinaEvento: (id: string) => api.post<{ ok: true }>(`/api/eventi/cestino/eventi/${id}/ripristina`),
    tratte: () => api.get<{ id: string; nome: string; eliminatoIl: string; eventoId: string; eventoArtista: string }[]>('/api/eventi/cestino/tratte'),
    ripristinaTratta: (id: string) => api.post<{ ok: true }>(`/api/eventi/cestino/tratte/${id}/ripristina`),
  },
};
