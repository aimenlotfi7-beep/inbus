import { api } from './client';
import type { Fornitore } from './fornitori';

export type StatoCandidato = 'automatico' | 'manuale' | 'gia_contattato' | 'accettato_in_precedenza';

export interface FornitoreCandidato extends Fornitore {
  distanzaKm: number;
  statoCandidato: StatoCandidato;
}

export interface RispostaPreventivo {
  id: string;
  richiestaId: string;
  prezzo: string;
  fileNome: string | null;
  fileFirmatoNome: string | null;
  // Valorizzata solo se l'email col file firmato è partita davvero.
  fileFirmatoInviatoIl: string | null;
  // Solo "c'è o non c'è": il contenuto (base64, anche MB) si scarica a
  // parte con scaricaFile() quando serve — non viaggia con la lista.
  haFile: boolean;
  haFileFirmato: boolean;
  inviataIl: string;
}

export interface RichiestaConRisposta {
  // Campi piatti, per ogni richiesta (con o senza risposta).
  richiestaId: string;
  fornitoreNome: string;
  creataIl: string;
  haRisposta: boolean;
  // Solo per chi non ha risposto: il link del fornitore non è più valido
  // (si può reinviare con reinviaRichiesta, che lo rimette in validità).
  linkScaduto: boolean;
  richiesta: { id: string; tragittoId: string; fornitoreId: string; tipoInvio: 'AUTOMATICO' | 'MANUALE'; creataIl: string };
  fornitore: Fornitore;
  risposta: RispostaPreventivo | null;
}

/** inviate* = email davvero partite; nonInviate = tentate ma non
 *  partite; senzaEmail = fornitori senza indirizzo (richiesta comunque
 *  registrata). */
export interface EsitoRichiestaPreventivi {
  inviateAutomatiche: number;
  inviateManuali: number;
  nonInviate: number;
  senzaEmail: number;
}

export interface EsitoAccettazione {
  ok: boolean;
  // Email "preventivo scelto" partita al fornitore accettato.
  fornitoreAvvisato: boolean;
  // Email "non scelto" partite (solo a chi ha risposto e non era ancora stato avvisato).
  nonSceltiAvvisati: number;
}

export interface DatiPubbliciPreventivo {
  tragitto: { nome: string; arrivoCitta: string | null; arrivoOrario: string | null };
  evento: { artista: string; data: string; luogo: string; citta: string } | null;
  fermate: { citta: string; indirizzo: string | null; orario: string | null }[];
  giaRisposto: boolean;
  scaduto: boolean;
  // Un preventivo è già stato accettato per questo viaggio: nuove risposte rifiutate (409).
  giaAssegnato: boolean;
  risposta: { prezzo: string; fileNome: string | null } | null;
}

export const preventiviApi = {
  candidati: (tragittoId: string, lat: number, lng: number, raggioKm?: number) =>
    api.get<FornitoreCandidato[]>(`/api/preventivi/candidati/${tragittoId}?lat=${lat}&lng=${lng}${raggioKm ? `&raggioKm=${raggioKm}` : ''}`),
  richiedi: (tragittoId: string, input: { lat?: number; lng?: number; raggioKm?: number; fornitoriManualiIds: string[] }) =>
    api.post<EsitoRichiestaPreventivi>(`/api/preventivi/richiedi/${tragittoId}`, input),
  // Solo richieste senza risposta: stesso link (rimesso in validità se scaduto).
  // 409 se ha già risposto, se il fornitore non ha email o se il viaggio è già assegnato.
  reinviaRichiesta: (richiestaId: string) =>
    api.post<{ inviata: boolean }>(`/api/preventivi/richieste/${richiestaId}/reinvia`, {}),
  listaPerTragitto: (tragittoId: string) => api.get<RichiestaConRisposta[]>(`/api/preventivi/tragitto/${tragittoId}`),
  contaDaValutare: () => api.get<{ conteggio: number }>('/api/preventivi/conta-da-valutare'),
  verificaKm: (tragittoId: string) => api.get<{ kmAccettati: number | null; kmAttuali: number | null; cambiatoParecchio: boolean }>(`/api/preventivi/verifica-km/${tragittoId}`),
  statistichePerFornitore: (dataDa?: string) => api.get<{ fornitore: Fornitore; richiesteRicevute: number; risposteDate: number; volteScelto: number; prezzoMedio: number | null }[]>(`/api/preventivi/statistiche/fornitori${dataDa ? `?dataDa=${dataDa}` : ''}`),
  storicoPerTratta: (dataDa?: string) => api.get<{ partenza: string; arrivo: string; prezzo: number; km: number | null; data: string; nomeTragitto: string; artista: string }[]>(`/api/preventivi/statistiche/tratte${dataDa ? `?dataDa=${dataDa}` : ''}`),
  accetta: (rispostaId: string) => api.put<EsitoAccettazione>(`/api/preventivi/risposte/${rispostaId}/accetta`, {}),
  scaricaFile: (rispostaId: string, quale: 'originale' | 'firmato') =>
    api.get<{ nome: string; contenuto: string }>(`/api/preventivi/risposte/${rispostaId}/file?quale=${quale}`),
  caricaFileFirmato: (rispostaId: string, fileNome: string, fileContenuto: string) =>
    api.post<{ ok: boolean; inviata: boolean }>(`/api/preventivi/risposte/${rispostaId}/file-firmato`, { fileNome, fileContenuto }),
  // Rimanda il file firmato già caricato. 409 se non c'è o se il fornitore non ha email.
  reinviaFileFirmato: (rispostaId: string) =>
    api.post<{ inviata: boolean }>(`/api/preventivi/risposte/${rispostaId}/reinvia-firmato`, {}),
  // Pubbliche — nessun accesso da amministratore, usate dal form di
  // risposta del fornitore (fuori dall'area /admin).
  getPubblico: (token: string) => api.get<DatiPubbliciPreventivo>(`/api/preventivi/pubblico/${token}`),
  rispondiPubblico: (token: string, input: { prezzo: number; fileNome?: string; fileContenuto?: string }) =>
    api.post<{ id: string; prezzo: string; fileNome: string | null }>(`/api/preventivi/pubblico/${token}/rispondi`, input),
};
