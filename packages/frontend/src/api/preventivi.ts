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
  fileContenuto: string | null;
  fileFirmatoNome: string | null;
  fileFirmatoContenuto: string | null;
  fileFirmatoInviatoIl: string | null;
  inviataIl: string;
}

export interface RichiestaConRisposta {
  richiesta: { id: string; tragittoId: string; fornitoreId: string; tipoInvio: 'AUTOMATICO' | 'MANUALE'; creataIl: string };
  fornitore: Fornitore;
  risposta: RispostaPreventivo | null;
}

export interface DatiPubbliciPreventivo {
  tragitto: { nome: string; arrivoCitta: string | null; arrivoOrario: string | null };
  evento: { artista: string; data: string; luogo: string; citta: string } | null;
  fermate: { citta: string; indirizzo: string | null; orario: string | null }[];
  giaRisposto: boolean;
  risposta: { prezzo: string; fileNome: string | null } | null;
}

export const preventiviApi = {
  candidati: (tragittoId: string, lat: number, lng: number, raggioKm?: number) =>
    api.get<FornitoreCandidato[]>(`/api/preventivi/candidati/${tragittoId}?lat=${lat}&lng=${lng}${raggioKm ? `&raggioKm=${raggioKm}` : ''}`),
  richiedi: (tragittoId: string, input: { lat?: number; lng?: number; raggioKm?: number; fornitoriManualiIds: string[] }) =>
    api.post<{ inviateAutomatiche: number; inviateManuali: number }>(`/api/preventivi/richiedi/${tragittoId}`, input),
  listaPerTragitto: (tragittoId: string) => api.get<RichiestaConRisposta[]>(`/api/preventivi/tragitto/${tragittoId}`),
  contaDaValutare: () => api.get<{ conteggio: number }>('/api/preventivi/conta-da-valutare'),
  verificaKm: (tragittoId: string) => api.get<{ kmAccettati: number | null; kmAttuali: number | null; cambiatoParecchio: boolean }>(`/api/preventivi/verifica-km/${tragittoId}`),
  accetta: (rispostaId: string) => api.put<{ ok: boolean }>(`/api/preventivi/risposte/${rispostaId}/accetta`, {}),
  caricaFileFirmato: (rispostaId: string, fileNome: string, fileContenuto: string) =>
    api.post<{ ok: boolean }>(`/api/preventivi/risposte/${rispostaId}/file-firmato`, { fileNome, fileContenuto }),
  // Pubbliche — nessun accesso da amministratore, usate dal form di
  // risposta del fornitore (fuori dall'area /admin).
  getPubblico: (token: string) => api.get<DatiPubbliciPreventivo>(`/api/preventivi/pubblico/${token}`),
  rispondiPubblico: (token: string, input: { prezzo: number; fileNome?: string; fileContenuto?: string }) =>
    api.post<RispostaPreventivo>(`/api/preventivi/pubblico/${token}/rispondi`, input),
};
