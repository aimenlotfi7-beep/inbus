import { api } from './client';

export interface MessaggioChat {
  id: string;
  eventoId: string;
  conversazioneId: string | null;
  autore: 'CLIENTE' | 'ADMIN';
  nome: string;
  email: string | null;
  testo: string;
  letto: boolean;
  creatoIl: string;
}

export interface Conversazione {
  id: string;
  stato: 'APERTA' | 'IN_CORSO' | 'CHIUSA';
  clienteNome: string;
  clienteEmail: string;
  eventoId: string;
  eventoArtista: string;
  creataIl: string;
  ultimoMessaggioIl: string;
  nonLetti: number;
}

export interface ConversazioneConMessaggi extends Omit<Conversazione, 'eventoArtista' | 'nonLetti'> {
  messaggi: MessaggioChat[];
}

export const chatApi = {
  // Admin
  listaConversazioni: (stato?: Conversazione['stato']) =>
    api.get<Conversazione[]>(`/api/chat/conversazioni${stato ? `?stato=${stato}` : ''}`),
  contaNonLette: () => api.get<{ conteggio: number }>('/api/chat/conversazioni/non-lette'),
  messaggiConversazione: (id: string) => api.get<MessaggioChat[]>(`/api/chat/conversazioni/${id}/messaggi`),
  rispondi: (id: string, testo: string) => api.post<MessaggioChat>(`/api/chat/conversazioni/${id}/rispondi`, { testo }),
  segnaLetti: (id: string) => api.post<void>(`/api/chat/conversazioni/${id}/segna-letti`),
  chiudi: (id: string) => api.post<{ ok: true }>(`/api/chat/conversazioni/${id}/chiudi`),
  riapri: (id: string) => api.post<{ ok: true }>(`/api/chat/conversazioni/${id}/riapri`),

  // Lato cliente (nessuna autenticazione admin richiesta)
  storicoCliente: (email: string) => api.get<ConversazioneConMessaggi[]>(`/api/chat/by-email?email=${encodeURIComponent(email)}`),
  inviaCliente: (input: { eventoId: string; nome: string; email: string; testo: string }) =>
    api.post<MessaggioChat>('/api/chat', input),
};
