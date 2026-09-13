import { api } from './client';

export interface Utente {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string;
  telefono: string | null;
  citta: string | null;
  creatoIl: string;
  creditoDisponibile: string;
}

export interface PreferenzePrivacy {
  presaVisioneInformativa: boolean | null;
  consensoMarketing: boolean | null;
  consensoProfilazione: boolean | null;
}

export interface PrenotazioneUtente {
  id: string;
  pnr: string;
  passeggeri: number;
  totale: string;
  stato: 'CONFERMATA' | 'CANCELLATA';
  tipoPagamento: 'COMPLETO' | 'ACCONTO';
  saldoPagato: boolean;
  creataIl: string;
  artista: string;
  dataEvento: string;
}

export const utentiApi = {
  list: () => api.get<Utente[]>('/api/utenti'),
  getById: (id: string) => api.get<Utente & { prenotazioni: PrenotazioneUtente[] }>(`/api/utenti/${id}`),
  // Le preferenze privacy del cliente stanno in clienteAuthApi (con l'account).
};
