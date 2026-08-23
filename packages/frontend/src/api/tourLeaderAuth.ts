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
  totale: number;
  saliti: number;
}
export type EsitoScansione =
  | { esito: 'valido'; nome: string }
  | { esito: 'gia_a_bordo'; nome: string }
  | { esito: 'bus_sbagliato' }
  | { esito: 'non_valido' };

export const controlloAccessiApi = {
  busAssegnati: () => chiamata<BusAssegnato[]>('/api/controllo-accessi/bus'),
  stato: (busId: string) => chiamata<StatoBus>(`/api/controllo-accessi/bus/${busId}/stato`),
  scansiona: (busId: string, token: string) =>
    chiamata<EsitoScansione>(`/api/controllo-accessi/bus/${busId}/scansiona`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  cerca: (q: string) => chiamata<RisultatoRicerca[]>(`/api/controllo-accessi/cerca?q=${encodeURIComponent(q)}`),
  checkinManuale: (partecipanteId: string) =>
    chiamata<{ nome: string }>('/api/controllo-accessi/checkin-manuale', { method: 'POST', body: JSON.stringify({ partecipanteId }) }),
};

export interface RisultatoRicerca {
  partecipanteId: string;
  nome: string;
  cognome: string;
  pnr: string;
  fermataCitta: string;
  giaSalito: boolean;
}
