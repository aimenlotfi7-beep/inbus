import { api } from './client';

export interface Permesso {
  chiave: string;
  etichetta: string;
  modulo: string;
  attivo: boolean;
}

export interface Ruolo {
  id: string;
  nome: string;
  descrizione: string | null;
  owner: boolean;
  permessi: string[]; // ['*'] se owner
}

export interface RuoloInput {
  nome: string;
  descrizione?: string;
  permessi: string[];
}

export const ruoliApi = {
  // Elenco completo (richiede permesso 'permessi.gestisci')
  list: () => api.get<Ruolo[]>('/api/ruoli'),
  create: (input: RuoloInput) => api.post<Ruolo>('/api/ruoli', input),
  update: (id: string, input: Partial<RuoloInput>) => api.put<{ ok: true }>(`/api/ruoli/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/ruoli/${id}`),

  // Permessi che l'utente loggato può assegnare ad altri (già filtrati
  // dal server in base a ciò che possiede lui stesso).
  permessiAssegnabili: () => api.get<Permesso[]>('/api/ruoli/permessi-assegnabili'),

  // Ruoli che l'utente loggato può assegnare creando/modificando
  // un'utenza (già filtrati dal server: solo quelli i cui permessi sono
  // un sotto-insieme dei suoi).
  assegnabili: () => api.get<Ruolo[]>('/api/ruoli/assegnabili'),
};
