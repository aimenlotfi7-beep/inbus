import { api } from './client';

export type TipoBundle = 'FISSO' | 'LIBERO';
export type StatoBundle = 'BOZZA' | 'PROGRAMMATO' | 'IN_VENDITA' | 'VENDITA_TERMINATA' | 'DISATTIVATO';

export interface BundleInput {
  nome: string; slug?: string; descrizione?: string | null; copertinaUrl?: string | null;
  tipo: TipoBundle; eventiIds: string[];
  minEventi?: number | null; maxEventi?: number | null;
  minPosti: number; maxPosti: number;
  scontoPercentuale: number;
  ammetteOfferte: boolean; ammetteCredito: boolean; ammettePromoter: boolean; ammetteAcconto: boolean;
  inizioVendita?: string | null; fineVendita?: string | null;
  visibileSeProgrammato: boolean; visibileSeTerminato: boolean;
  attivo: boolean; inEvidenzaHome: boolean;
  organizzatoreId?: string | null;
}

export interface BundleRiga {
  id: string; nome: string; slug: string; tipo: TipoBundle; stato: StatoBundle; numeroEventi: number;
  scontoPercentuale: string; inizioVendita: string | null; fineVendita: string | null; attivo: boolean; inEvidenzaHome: boolean;
  organizzatoreId: string | null; copertinaUrl: string | null;
}

export interface EventoDelBundle {
  id: string; slug: string; artista: string; data: string; citta: string; luogo: string; genere: string;
  immagineUrl: string | null; eliminato: boolean; vendibile: boolean;
}

export interface BundleDettaglio extends Omit<BundleInput, 'eventiIds' | 'scontoPercentuale'> {
  id: string; slug: string; stato: StatoBundle; scontoPercentuale: string; eventi: EventoDelBundle[];
  minEventi: number | null; maxEventi: number | null; organizzatoreId: string | null;
}

export interface BundlePubblico {
  id: string; slug: string; nome: string; descrizione: string | null; copertinaUrl: string | null; tipo: TipoBundle;
  scontoPercentuale: string; inizioVendita: string | null; fineVendita: string | null; inEvidenzaHome: boolean; stato: StatoBundle;
}

export interface BundlePubblicoDettaglio extends BundlePubblico {
  minEventi: number | null; maxEventi: number | null; minPosti: number; maxPosti: number;
  ammetteOfferte: boolean; ammetteCredito: boolean; ammettePromoter: boolean; ammetteAcconto: boolean;
  acquistabile: boolean; eventi: EventoDelBundle[];
}

export const bundleApi = {
  list: () => api.get<BundleRiga[]>('/api/bundle'),
  dettaglio: (id: string) => api.get<BundleDettaglio>(`/api/bundle/${id}`),
  create: (input: BundleInput) => api.post<{ id: string }>('/api/bundle', input),
  update: (id: string, input: BundleInput) => api.put<{ id: string }>(`/api/bundle/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/bundle/${id}`),
  // pubbliche
  listaPubblica: () => api.get<BundlePubblico[]>('/api/bundle/pubblico'),
  dettaglioPubblico: (slug: string) => api.get<BundlePubblicoDettaglio>(`/api/bundle/pubblico/${slug}`),
};

export const ETICHETTA_STATO_BUNDLE: Record<StatoBundle, string> = {
  BOZZA: 'Bozza', PROGRAMMATO: 'Programmato', IN_VENDITA: 'In vendita', VENDITA_TERMINATA: 'Vendita terminata', DISATTIVATO: 'Disattivato',
};
export const CLASSE_STATO_BUNDLE: Record<StatoBundle, string> = {
  BOZZA: 'badge-stato-arancio', PROGRAMMATO: 'badge-stato-arancio', IN_VENDITA: 'badge-stato-verde', VENDITA_TERMINATA: 'badge-stato-rosso', DISATTIVATO: 'badge-stato-rosso',
};

/** Data/ora sempre italiana, qualunque sia il fuso del browser. */
export function formattaDataOraIt(d: string | Date): string {
  return new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
