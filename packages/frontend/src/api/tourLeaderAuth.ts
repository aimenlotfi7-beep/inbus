import { scaricaBlob } from './client';
import type { PasseggeroBus } from './eventi';

export type { PasseggeroBus };

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const CHIAVE_TOKEN = 'inbus_tourleader_token';
const CHIAVE_NOME = 'inbus_tourleader_nome';

export function tokenTourLeader() {
  return localStorage.getItem(CHIAVE_TOKEN);
}
export function nomeTourLeader() {
  return localStorage.getItem(CHIAVE_NOME);
}
export function logoutTourLeader() {
  localStorage.removeItem(CHIAVE_TOKEN);
  localStorage.removeItem(CHIAVE_NOME);
}

async function chiamata<T>(percorso: string, opzioni: RequestInit = {}): Promise<T> {
  const token = tokenTourLeader();
  const res = await fetch(`${API_URL}${percorso}`, {
    ...opzioni,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opzioni.headers,
    },
  });
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dati.errore ?? 'Errore di rete');
  return dati as T;
}

export const tourLeaderAuthApi = {
  async login(email: string, password: string) {
    const r = await chiamata<{ token: string; nome: string }>('/api/tour-leader-auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(CHIAVE_TOKEN, r.token);
    localStorage.setItem(CHIAVE_NOME, r.nome);
    return r;
  },
  richiediReset: (email: string) => chiamata<{ ok: true }>('/api/tour-leader-auth/richiedi-reset', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => chiamata<{ ok: true }>('/api/tour-leader-auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
};

export interface BusAssegnato {
  busId: string;
  riferimento: string;
  eventoId: string;
  eventoArtista: string;
  eventoData: string;
}
export interface StatoBus {
  riferimento: string;
  totale: number; // passeggeri assegnati a questo bus dallo smistamento
  saliti: number;
}
/** bus_sbagliato: la prenotazione è su un altro bus (busGiusto = il suo
 *  riferimento) o non ancora su nessuno (busGiusto null); messaggio già
 *  pronto da mostrare. */
export type EsitoScansione =
  | { esito: 'valido'; nome: string }
  | { esito: 'gia_a_bordo'; nome: string }
  | { esito: 'bus_sbagliato'; nome: string; busGiusto: string | null; messaggio: string }
  | { esito: 'non_valido' };

/** La lista del bus: disponibile solo da 24 ore prima della partenza
 *  (prima disponibile false, lista vuota e disponibileDal ISO). */
export interface ListaPasseggeriBus {
  disponibile: boolean;
  disponibileDal: string | null;
  passeggeri: PasseggeroBus[];
}

export const controlloAccessiApi = {
  busAssegnati: () => chiamata<BusAssegnato[]>('/api/controllo-accessi/bus'),
  stato: (busId: string) => chiamata<StatoBus>(`/api/controllo-accessi/bus/${busId}/stato`),
  scansiona: (busId: string, token: string) =>
    chiamata<EsitoScansione>(`/api/controllo-accessi/bus/${busId}/scansiona`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  // busId facoltativo: con il bus, "valido" vuol dire "su questo bus";
  // senza, "su uno dei miei bus".
  cerca: (q: string, busId?: string) =>
    chiamata<RisultatoRicerca[]>(`/api/controllo-accessi/cerca?q=${encodeURIComponent(q)}${busId ? `&busId=${encodeURIComponent(busId)}` : ''}`),
  // 403 con un messaggio che indica il bus giusto se il passeggero è altrove.
  checkinManuale: (partecipanteId: string, busId?: string) =>
    chiamata<{ nome: string }>('/api/controllo-accessi/checkin-manuale', { method: 'POST', body: JSON.stringify({ partecipanteId, busId }) }),
  listaPasseggeri: (busId: string) => chiamata<ListaPasseggeriBus>(`/api/controllo-accessi/bus/${busId}/passeggeri`),
  // Stesso dato della scansione e del check-in manuale; 403 se il
  // passeggero non è di quel bus.
  segnaSalito: (busId: string, passeggeroId: string, salito: boolean) =>
    chiamata<{ salito: boolean }>(`/api/controllo-accessi/bus/${busId}/passeggeri/${passeggeroId}/salito`, {
      method: 'PUT',
      body: JSON.stringify({ salito }),
    }),
  scaricaPdfPasseggeri: (busId: string): Promise<Blob> => scaricaBlob(`/api/controllo-accessi/bus/${busId}/passeggeri/pdf`, CHIAVE_TOKEN),
};

export interface RisultatoRicerca {
  partecipanteId: string;
  nome: string;
  cognome: string;
  pnr: string;
  fermataCitta: string;
  giaSalito: boolean;
  busId: string | null; // il bus assegnato dallo smistamento
  bus: string | null;   // il suo riferimento (targa)
  valido: boolean;      // il check-in si può fare
  messaggio: string | null; // se non valido: dove viaggia davvero
}
