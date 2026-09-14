import { api } from './client';
import type { Fornitore } from './fornitori';

/** Richieste ai fornitori (deciso dal proprietario, settembre 2026):
 *  - QUOTAZIONE, per il tragitto: prezzo indicativo di un bus, serve solo a
 *    fare i prezzi. Sceglierla non manda email e non impegna nessuno.
 *  - BUS, per una proposta da confermare: il preventivo vero di quel bus. Il
 *    fornitore scelto diventa il fornitore del bus e riceve il file firmato. */
export type ScopoRichiesta = 'QUOTAZIONE' | 'BUS';

export type StatoCandidato = 'automatico' | 'manuale' | 'gia_contattato' | 'accettato_in_precedenza';

export interface FornitoreCandidato extends Fornitore {
  distanzaKm: number;
  statoCandidato: StatoCandidato;
}

/** Percorso cambiato dopo la quotazione scelta: cosa c'è da fare.
 *  da_richiedere = chiedere una nuova quotazione (o confermare l'attuale);
 *  in_attesa = richiesta inviata, nessuna risposta; da_valutare = risposte
 *  arrivate, da scegliere. */
export type StatoCambioPercorso = 'da_richiedere' | 'in_attesa' | 'da_valutare';
export interface CambioPercorso {
  tragittoId: string;
  stato: StatoCambioPercorso;
  fermateTolte: string[];
  fermateAggiunte: string[];
  // Solo se confrontabili (salvati con lo stesso calcolo): altrimenti null.
  kmPreventivo: number | null;
  kmOra: number | null;
}

export interface RispostaPreventivo {
  id: string;
  richiestaId: string;
  prezzo: string;
  // I posti del bus offerto (le risposte più vecchie non li hanno).
  postiBus: number | null;
  // Solo per il preventivo di un bus scelto: il bus confermato.
  busId: string | null;
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
  // Richiesta mandata per un cambio di percorso: "aperta" se è della
  // tornata in corso (il fornitore può rispondere), "chiusa" se nel
  // frattempo il percorso della quotazione è stato aggiornato; null = normale.
  cambioPercorso: 'aperta' | 'chiusa' | null;
  richiesta: { id: string; tragittoId: string; fornitoreId: string; tipoInvio: 'AUTOMATICO' | 'MANUALE'; creataIl: string; perCambioPercorso: boolean; scopo: ScopoRichiesta; lineaId: string | null };
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

export interface DatiPubbliciPreventivo {
  scopo: ScopoRichiesta;
  tragitto: { nome: string; arrivoCitta: string | null; arrivoOrario: string | null };
  evento: { artista: string; data: string; luogo: string; citta: string } | null;
  fermate: { citta: string; indirizzo: string | null; orario: string | null }[];
  // Solo per un bus: nome della proposta e posti di riferimento.
  bus: { nome: string | null; postiRiferimento: number | null } | null;
  giaRisposto: boolean;
  scaduto: boolean;
  // Non si può più rispondere (quotazione già scelta, bus già assegnato o non più necessario): motivoChiusura dice perché.
  giaAssegnato: boolean;
  motivoChiusura: string | null;
  // Nuova richiesta perché il percorso è cambiato: la pagina lo spiega.
  perCambioPercorso: boolean;
  risposta: { prezzo: string; postiBus: number | null; fileNome: string | null } | null;
}

export const preventiviApi = {
  candidati: (tragittoId: string, lat: number, lng: number, raggioKm?: number) =>
    api.get<FornitoreCandidato[]>(`/api/preventivi/candidati/${tragittoId}?lat=${lat}&lng=${lng}${raggioKm ? `&raggioKm=${raggioKm}` : ''}`),
  // Quotazione. perCambioPercorso: nuova richiesta perché il percorso è cambiato —
  // anche i fornitori già contattati si possono scegliere e possono rispondere.
  richiedi: (tragittoId: string, input: { lat?: number; lng?: number; raggioKm?: number; fornitoriManualiIds: string[]; perCambioPercorso?: boolean }) =>
    api.post<EsitoRichiestaPreventivi>(`/api/preventivi/richiedi/${tragittoId}`, input),
  // Preventivi per il bus di una proposta da confermare: fornitori vicini alla
  // sua prima fermata, più chi ha dato la quotazione (sempre, in cima).
  candidatiBus: (propostaId: string, lat: number, lng: number) =>
    api.get<FornitoreCandidato[]>(`/api/preventivi/proposta/${propostaId}/candidati?lat=${lat}&lng=${lng}`),
  richiediBus: (propostaId: string, input: { lat: number; lng: number; fornitoriManualiIds: string[] }) =>
    api.post<EsitoRichiestaPreventivi>(`/api/preventivi/proposta/${propostaId}/richiedi`, input),
  listaPerProposta: (propostaId: string) => api.get<RichiestaConRisposta[]>(`/api/preventivi/proposta/${propostaId}`),
  // Solo richieste senza risposta: stesso link (rimesso in validità se scaduto).
  // 409 se ha già risposto, se il fornitore non ha email o se la richiesta è chiusa.
  reinviaRichiesta: (richiestaId: string) =>
    api.post<{ inviata: boolean }>(`/api/preventivi/richieste/${richiestaId}/reinvia`, {}),
  listaPerTragitto: (tragittoId: string) => api.get<RichiestaConRisposta[]>(`/api/preventivi/tragitto/${tragittoId}`),
  // null se il percorso è ancora quello della quotazione scelta.
  percorso: (tragittoId: string) => api.get<CambioPercorso | null>(`/api/preventivi/percorso/${tragittoId}`),
  // "La quotazione va ancora bene": il percorso di adesso diventa quello della quotazione.
  confermaPercorso: (tragittoId: string) => api.post<{ ok: true }>(`/api/preventivi/tragitto/${tragittoId}/percorso-ok`, {}),
  // Sceglie una risposta come quotazione del tragitto: nessuna email.
  accetta: (rispostaId: string) => api.put<{ ok: true }>(`/api/preventivi/risposte/${rispostaId}/accetta`, {}),
  scaricaFile: (rispostaId: string, quale: 'originale' | 'firmato') =>
    api.get<{ nome: string; contenuto: string }>(`/api/preventivi/risposte/${rispostaId}/file?quale=${quale}`),
  // Solo per il preventivo di un bus confermato.
  caricaFileFirmato: (rispostaId: string, fileNome: string, fileContenuto: string) =>
    api.post<{ ok: boolean; inviata: boolean }>(`/api/preventivi/risposte/${rispostaId}/file-firmato`, { fileNome, fileContenuto }),
  // Rimanda il file firmato già caricato. 409 se non c'è o se il fornitore non ha email.
  reinviaFileFirmato: (rispostaId: string) =>
    api.post<{ inviata: boolean }>(`/api/preventivi/risposte/${rispostaId}/reinvia-firmato`, {}),
  // Pubbliche — nessun accesso da amministratore, usate dal form di
  // risposta del fornitore (fuori dall'area /admin).
  getPubblico: (token: string) => api.get<DatiPubbliciPreventivo>(`/api/preventivi/pubblico/${token}`),
  rispondiPubblico: (token: string, input: { prezzo: number; postiBus: number; fileNome?: string; fileContenuto?: string }) =>
    api.post<{ id: string; prezzo: string; postiBus: number | null; fileNome: string | null }>(`/api/preventivi/pubblico/${token}/rispondi`, input),
};
