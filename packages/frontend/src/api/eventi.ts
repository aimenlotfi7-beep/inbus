import { api, scaricaBlob } from './client';
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
  cosaIncluso?: string;
  requisitiNote?: string;
  ticketColoreAccento?: string;
  ticketImmagineSfondoUrl?: string;
  layoutBigliettoId?: string | null;
  immagini?: string[]; allegati?: { nome: string; url: string }[]; tragitti?: TragittoInput[];
  // I servizi (pacchetti bus distinti dentro lo stesso evento) — ognuno
  // con i propri tragitti annidati. Facoltativo: la maggior parte degli
  // eventi non ne ha bisogno.
  servizi?: { id?: string; nome: string; tragitti: TragittoInput[] }[];
}

/** Email mandate ai clienti dopo un salvataggio: clientiAvvisati = email
 *  tentate, emailNonInviate = quante di quelle non sono partite. */
export interface EsitoAvvisiClienti { clientiAvvisati: number; emailNonInviate: number; }

/** Anteprima (nessuna scrittura) di PUT /tragitti/:id/operativo: clienti
 *  = email che partirebbero per quella variazione (0 = cambio rilevato
 *  ma nessuno prenotato su quella fermata). */
export interface AnteprimaVariazioniTragitto {
  clientiTotali: number;
  variazioni: { fermata: string; descrizione: string; clienti: number }[];
}
/** Anteprima (nessuna scrittura) di PUT /eventi/:id. fermata = '' per i
 *  cambi che toccano tutto il viaggio (data/ora o luogo dell'evento). */
export interface AnteprimaVariazioniEvento {
  clientiTotali: number;
  variazioni: { tragitto: string; fermata: string; descrizione: string; clienti: number }[];
}

export interface FermataConPasseggeri { fermataId: string; citta: string; passeggeri: number; }
export interface CalcoloBusTragitto {
  tragittoId: string;
  servizioId: string | null;
  nome: string;
  stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO';
  /** Posti dei bus confermati: quelli in vendita non si fermano mai. */
  postiTotali: number;
  capienzaPerBus: number;
  fermate: FermataConPasseggeri[];
  totalePasseggeri: number;
  busSuggeriti: number;
  coperta: boolean;
  postiBusCensiti: number;
  lineeDaConfermare: number;
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
/** tourLeaderAvvisato: esito dell'email al tour leader appena assegnato
 *  (o cambiato); null = nessun tour leader nuovo, nessuna email. */
export interface EsitoCreaLinea extends EsitoAvvisiClienti {
  lineaId: string;
  busId: string;
  // true = era la prima Linea: il tragitto è appena diventato CONFERMATO
  // e i clienti con prenotazione confermata sono stati avvisati.
  partenzaConfermata: boolean;
  tourLeaderAvvisato: boolean | null;
}
export interface FermataLinea { fermataId: string; citta: string; orario: string | null; inAttesa: number; versati: number; }
export interface BusDiLinea {
  id: string; fornitoreId: string | null; riferimento: string; autistaNome: string | null; autistaTelefono: string | null;
  tourLeaderId: string | null; tourLeaderNome: string | null; costo: string | null; postiBus: number | null; note: string | null;
}
/** daConfermare: linea creata in automatico (soglia di pareggio raggiunta o
 *  bus pieni), senza bus finché l'admin non la conferma con confermaLinea. */
export interface Linea { id: string; nome: string; daConfermare: boolean; fermate: FermataLinea[]; bus: BusDiLinea[]; }
/** Un passeggero di UN bus: solo le prenotazioni che lo smistamento ha
 *  messo su quel bus, in ordine di orario della fermata e cognome. id = il
 *  partecipante (serve per segnare la salita); orario "HH:MM". */
export interface PasseggeroBus { id: string; pnr: string; nome: string; cognome: string; fermata: string; orario: string | null; telefono: string | null; salito: boolean }
/** Come lo smistamento automatico riempirebbe i bus di un tragitto adesso
 *  (nessuna scrittura): le prenotazioni già assegnate restano ferme, le
 *  altre sono simulate. etaMedia in anni, una cifra decimale. */
export interface AnteprimaSmistamento {
  smistamentoIl: string | null; // ISO: quando parte lo smistamento (partenza meno 24 ore); null se non calcolabile
  giaSmistato: boolean;         // true se la finestra delle 24 ore è già iniziata
  linee: { lineaId: string; lineaNome: string; bus: { busId: string; riferimento: string; postiBus: number | null; passeggeri: number; prenotazioni: number; etaMedia: number | null }[] }[];
  senzaPosto: { prenotazioni: number; passeggeri: number };
}
export interface RiepilogoEconomicoLinea { lineaId: string; lineaNome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; }
export interface RiepilogoEconomicoTratta { tragittoId: string; nome: string; incassato: number; costo: number; costoCensito: boolean; guadagno: number; perLinea: RiepilogoEconomicoLinea[]; }
export interface SuggerimentoLinea {
  pronta: boolean;
  lineaGiaConfermata: boolean;
  serveSecondoBus: boolean;
  totaleConfermati: number;
  postiDiPareggio?: number;
  capienzaReale: number;
  fornitoreId?: string | null;
  costo?: number | null;
  postiBus?: number | null;
  fermateSenzaPrenotazioni?: { id: string; citta: string }[];
}
export interface VenditePerFermata {
  perFermata: { citta: string; confermati: number }[];
  andamento: { data: string; citta: string; cumulativo: number }[];
}

export const eventiApi = {
  list: (filtri?: { citta?: string; genere?: string; ricerca?: string; soloFuturi?: boolean; soloVisibili?: boolean; escludiEventiInTour?: boolean }) => {
    const query = new URLSearchParams(filtri as Record<string, string>).toString();
    return api.get<Evento[]>(`/api/eventi${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => api.get<Evento>(`/api/eventi/${id}`),
  getBySlug: (slug: string) => api.get<Evento>(`/api/eventi/slug/${slug}`),
  conteggioPrenotazioni: (id: string) => api.get<{ conteggio: number }>(`/api/eventi/${id}/conteggio-prenotazioni`),
  opzioniPartenza: (id: string, servizioId?: string) =>
    api.get<OpzionePartenza[]>(`/api/eventi/${id}/opzioni-partenza${servizioId ? `?servizioId=${servizioId}` : ''}`),
  create: (input: EventoInput) => api.post<Evento>('/api/eventi', input),
  // L'evento aggiornato, più l'esito degli avvisi ai clienti per le
  // variazioni (fermate, data, luogo) che il salvataggio ha generato.
  update: (id: string, input: Partial<EventoInput>) => api.put<Evento & EsitoAvvisiClienti>(`/api/eventi/${id}`, input),
  // Stesso corpo di update, nessuna scrittura: cosa verrebbe comunicato.
  anteprimaVariazioni: (id: string, input: Partial<EventoInput>) =>
    api.post<AnteprimaVariazioniEvento>(`/api/eventi/${id}/anteprima-variazioni`, input),
  remove: (id: string) => api.delete<void>(`/api/eventi/${id}`),
  // "Ferma vendite" / "Riapri vendite": con le vendite ferme l'evento non
  // compare sul sito e non si può prenotare, nemmeno con il link.
  impostaVenditeFermate: (id: string, fermate: boolean) => api.put<{ ok: true; venditeFermate: boolean }>(`/api/eventi/${id}/vendite`, { fermate }),

  calcolaBus: (id: string) => api.get<CalcoloBusTragitto[]>(`/api/eventi/${id}/calcola-bus`),
  listaBus: (id: string) => api.get<BusFisico[]>(`/api/eventi/${id}/bus`),

  creaLinea: (id: string, input: LineaInput) => api.post<EsitoCreaLinea>(`/api/eventi/${id}/linee`, input),
  aggiungiBusALinea: (lineaId: string, input: BusDiLineaInput) =>
    api.post<{ id: string; tourLeaderAvvisato: boolean | null }>(`/api/eventi/linee/${lineaId}/bus`, input),
  aggiornaPercorsoLinea: (eventoId: string, lineaId: string, fermateIds: string[]) => api.put<{ ok: true }>(`/api/eventi/${eventoId}/linee/${lineaId}/percorso`, { fermateIds }),
  aggiornaBusDiLinea: (busId: string, input: Partial<BusDiLineaInput>) =>
    api.put<{ ok: true; tourLeaderAvvisato: boolean | null }>(`/api/eventi/linee/bus/${busId}`, input),
  listaLinee: (tragittoId: string) => api.get<Linea[]>(`/api/eventi/tragitti/${tragittoId}/linee`),
  // Elimina la linea e i suoi bus: i passeggeri assegnati tornano senza bus
  // e li riprende lo smistamento. 409 se i posti del tragitto scenderebbero
  // sotto quelli venduti.
  eliminaLinea: (lineaId: string) => api.delete<{ ok: true }>(`/api/eventi/linee/${lineaId}`),
  // Conferma una linea da confermare (creata in automatico): dati del primo
  // bus e fermate, come creaLinea. 409 se nel frattempo è sparita perché non
  // serviva più, o è già confermata.
  confermaLinea: (lineaId: string, input: LineaInput) => api.post<EsitoCreaLinea>(`/api/eventi/linee/${lineaId}/conferma`, input),
  // L'assegnazione ai bus è solo automatica (per età, il giorno prima della
  // partenza): questa è l'anteprima, senza scritture.
  anteprimaSmistamento: (tragittoId: string) => api.get<AnteprimaSmistamento>(`/api/eventi/tragitti/${tragittoId}/anteprima-smistamento`),
  // Fase 2 — orario/prezzo/posti si modificano da Partenze, non più da
  // Eventi. aggiornaServizio esisteva già lato backend (mai usata dal
  // frontend finora) — qui il client mancante.

  // prezzoExtra facoltativo: se non lo mandi resta quello salvato.
  aggiornaTragittoOperativo: (tragittoId: string, input: { prezzoExtra?: number; fermate: FermataInput[] }) =>
    api.put<{ ok: true } & EsitoAvvisiClienti>(`/api/eventi/tragitti/${tragittoId}/operativo`, input),
  // Stesso corpo, nessuna scrittura: quali variazioni e quanti clienti.
  anteprimaTragittoOperativo: (tragittoId: string, input: { prezzoExtra?: number; fermate: FermataInput[] }) =>
    api.post<AnteprimaVariazioniTragitto>(`/api/eventi/tragitti/${tragittoId}/operativo/anteprima`, input),
  // Sezione PREVENTIVI: registra il costo (fornitore+file facoltativi) —
  // non tocca i prezzi di vendita.
  registraPreventivoManuale: (tragittoId: string, input: { preventivoCosto: number; preventivoPostiBus: number; fornitoreId?: string; fileNome?: string; fileContenuto?: string }) =>
    api.put<{ ok: true }>(`/api/eventi/tragitti/${tragittoId}/preventivo`, input),
  // Sezione PREZZI: i prezzi di vendita per fermata, da un costo GIÀ noto.
  calcolaPrezziVendita: (tragittoId: string, input: { prezziPerFermata: { fermataId: string; prezzo: number }[] }) =>
    api.put<{ ok: true }>(`/api/eventi/tragitti/${tragittoId}/prezzi-vendita`, input),
  rimuoviBus: (id: string, busId: string) => api.delete<void>(`/api/eventi/${id}/bus/${busId}`),
  listaPasseggeriBus: (id: string, busId: string) => api.get<PasseggeroBus[]>(`/api/eventi/${id}/bus/${busId}/passeggeri`),
  // PDF A4 della lista passeggeri del bus (casella da spuntare a mano).
  scaricaPdfPasseggeriBus: (eventoId: string, busId: string): Promise<Blob> => scaricaBlob(`/api/eventi/${eventoId}/bus/${busId}/passeggeri/pdf`),
  riepilogoEconomico: (id: string) => api.get<RiepilogoEconomicoTratta[]>(`/api/eventi/${id}/riepilogo-economico`),
  venditePerFermata: (tragittoId: string) => api.get<VenditePerFermata>(`/api/eventi/tragitti/${tragittoId}/vendite`),
  suggerimentoLinea: (tragittoId: string) => api.get<SuggerimentoLinea>(`/api/eventi/tragitti/${tragittoId}/suggerimento-linea`),
  allertePartenze: () => api.get<{ conteggio: number }>('/api/eventi/allerte-partenze'),
  eventiDaCalcolareOrari: () => api.get<{ conteggio: number }>('/api/eventi/eventi-da-calcolare-orari'),
  eventiDaPrezzare: () => api.get<{ conteggio: number }>('/api/eventi/eventi-da-prezzare'),
  eventiPreventiviDaRichiedere: () => api.get<{ conteggio: number }>('/api/eventi/eventi-preventivi-da-richiedere'),
  lineeProntoDaConfermare: () => api.get<{ conteggio: number }>('/api/eventi/linee-pronto-da-confermare'),
  allertePartenzePerEvento: () => api.get<Record<string, number>>('/api/eventi/allerte-partenze-per-evento'),
  elencoPartenze: () => api.get<Array<{
    tragittoId: string; tragittoNome: string;
    stato: 'DA_CONFERMARE' | 'PREZZATO' | 'CONFERMATO';
    postiTotali: number; totalePasseggeri: number;
    // Posti dei bus confermati (postiTotali resta "quasi illimitato") e linee da confermare.
    postiSuiBus: number; lineeDaConfermare: number;
    preventivoCosto: string | null; fornitoreId: string | null; fermateCompilate: boolean; servizioNome: string | null; servizioId: string | null;
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
