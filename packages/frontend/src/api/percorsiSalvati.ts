import { api } from './client';

export interface FermataPercorsoSalvato {
  id?: string;
  fermataAnagraficaId?: string | null;
  citta: string;
  // Facoltativo solo per la PRIMA fermata dell'elenco (la Partenza,
  // per posizione) — l'indirizzo vero si scrive in Eventi, quando il
  // percorso viene applicato (la venue dipende dall'evento).
  indirizzo?: string | null;
  prezzo?: number;
  tipo?: 'PARTENZA' | 'PASSAGGIO';
  sogliaMinima?: number | null;
}
export interface PercorsoSalvato {
  id: string;
  nome: string;
  fermate: FermataPercorsoSalvato[];
}
export type PercorsoSalvatoInput = { nome: string; fermate: FermataPercorsoSalvato[] };

export const percorsiSalvatiApi = {
  list: () => api.get<PercorsoSalvato[]>('/api/percorsi-salvati'),
  getById: (id: string) => api.get<PercorsoSalvato>(`/api/percorsi-salvati/${id}`),
  create: (input: PercorsoSalvatoInput) => api.post<PercorsoSalvato>('/api/percorsi-salvati', input),
  update: (id: string, input: Partial<PercorsoSalvatoInput>) => api.put<PercorsoSalvato>(`/api/percorsi-salvati/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/percorsi-salvati/${id}`),
};
