import { api } from './client';

export interface TourLeader {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string | null;
  citta: string | null;
  lingue: string | null;
  disponibilita: string | null;
  esperienza: string | null;
  stato: 'CANDIDATO' | 'ATTIVO' | 'ARCHIVIATO';
  note: string | null;
  dataCandidatura: string;
}

export interface CandidaturaInput {
  nome: string; cognome: string; email: string; telefono?: string; dataNascita?: string;
  citta?: string; lingue?: string; disponibilita?: string; esperienza?: string;
  note?: string; eventoRiferimento?: string;
}

export const tourLeaderApi = {
  list: () => api.get<TourLeader[]>('/api/tour-leader'),
  update: (id: string, input: Partial<Pick<TourLeader, 'stato' | 'note'>>) =>
    api.put<TourLeader>(`/api/tour-leader/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/tour-leader/${id}`),

  // Pubblico: il form di autocandidatura, nessun login richiesto
  candidatura: (input: CandidaturaInput) => api.post<TourLeader>('/api/tour-leader/candidatura', input),
};
