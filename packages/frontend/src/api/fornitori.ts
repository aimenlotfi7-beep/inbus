import { api } from './client';

export type StatoFornitore = 'IN_ATTESA' | 'APPROVATO' | 'DISATTIVATO';

export interface Fornitore {
  id: string;
  nome: string;
  partitaIva: string | null;
  referente: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  stato: StatoFornitore;
  invioAutomatico: boolean;
  campiExtra: { etichetta: string; valore: string }[] | null;
  creatoIl: string;
}
export type FornitoreInput = Omit<Fornitore, 'id' | 'stato' | 'creatoIl'>;

export interface CampoExtraConfig {
  id: string;
  etichetta: string;
  ordine: number;
}

export const fornitoriApi = {
  list: () => api.get<Fornitore[]>('/api/fornitori'),
  create: (input: Partial<FornitoreInput>) => api.post<Fornitore>('/api/fornitori', input),
  update: (id: string, input: Partial<FornitoreInput>) => api.put<Fornitore>(`/api/fornitori/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/fornitori/${id}`),
  cambiaStato: (id: string, stato: StatoFornitore) => api.put<Fornitore>(`/api/fornitori/${id}/stato`, { stato }),
  contaInAttesa: () => api.get<{ conteggio: number }>('/api/fornitori/conta-in-attesa'),
  // Pubbliche — nessun accesso da amministratore, usate dal form di
  // autoregistrazione (fuori dall'area /admin).
  campiExtraConfig: () => api.get<CampoExtraConfig[]>('/api/fornitori/campi-extra-config'),
  registrazionePubblica: (input: { nome: string; partitaIva?: string; referente?: string; telefono?: string; email: string; indirizzo: string; lat?: number; lng?: number; campiExtra?: { etichetta: string; valore: string }[] }) =>
    api.post<Fornitore>('/api/fornitori/registrazione', input),
  // Gestione dei campi extra configurabili — schermata admin.
  creaCampoExtraConfig: (input: { etichetta: string; ordine?: number }) => api.post<CampoExtraConfig>('/api/fornitori/campi-extra-config', input),
  eliminaCampoExtraConfig: (id: string) => api.delete<void>(`/api/fornitori/campi-extra-config/${id}`),
};
