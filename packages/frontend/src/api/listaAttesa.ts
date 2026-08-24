import { api } from './client';

export interface IscrizioneListaAttesaPayload {
  eventoId: string;
  tragittoId?: string;
  fermataId?: string;
  passeggeri: number;
  cliente: { email: string; nome: string; cognome: string; telefono: string };
  partecipanti: { nome: string; cognome: string }[];
}

export interface MiaIscrizione {
  id: string;
  eventoId: string;
  passeggeri: number;
  dataCreazione: string;
  posizione: number;
  evento: { artista: string; data: string; luogo: string; citta: string } | null;
}

export interface DatiFinalizzazione {
  eventoId: string;
  artista: string;
  luogo: string;
  citta: string;
  data: string | null;
  tragittoId: string | null;
  fermataId: string | null;
  passeggeri: number;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  partecipanti: { nome: string; cognome: string }[];
}

export interface IscrizioneListaAttesa {
  id: string;
  nome: string;
  cognome: string | null;
  email: string;
  telefono: string | null;
  passeggeri: number;
  stato: 'IN_ATTESA' | 'PROMOSSA';
  emailInviata: boolean;
  completata: boolean;
  dataCreazione: string;
  fermataCitta: string | null;
}

export const listaAttesaApi = {
  iscriviti: (payload: IscrizioneListaAttesaPayload) => api.post<{ id: string }>('/api/lista-attesa', payload),
  getByToken: (token: string) => api.get<DatiFinalizzazione>(`/api/lista-attesa/finalizza/${token}`),
  finalizza: (token: string, input: { tragittoId: string; fermataId: string; tipoPagamento: 'COMPLETO' | 'ACCONTO'; metodoPagamento: string }) =>
    api.post<{ pnr: string }>(`/api/lista-attesa/finalizza/${token}`, input),
  // Amministrazione
  listByEvento: (eventoId: string) => api.get<IscrizioneListaAttesa[]>(`/api/lista-attesa/eventi/${eventoId}`),
  contaPartecipanti: (eventoId: string) => api.get<{ partecipanti: number }>(`/api/lista-attesa/eventi/${eventoId}/conta-partecipanti`),
  contaInAttesa: () => api.get<{ conteggio: number }>('/api/lista-attesa/allerte'),
  mieIscrizioni: (email: string) => api.get<MiaIscrizione[]>(`/api/lista-attesa/mie?email=${encodeURIComponent(email)}`),
  contaInAttesaPerEvento: () => api.get<Record<string, number>>('/api/lista-attesa/allerte-per-evento'),
  promuovi: (id: string) => api.post<{ ok: true; emailInviata: boolean; link: string }>(`/api/lista-attesa/${id}/promuovi`),
  promuoviTutte: (eventoId: string) => api.post<{ promosse: number; fallite: number }>(`/api/lista-attesa/evento/${eventoId}/promuovi-tutte`),
};
