import { api } from './client';

/** Pagamenti ai fornitori (amministrazione). Gli importi sono numeri in
 *  euro, le date testo ISO. Lo stato non è salvato da nessuna parte: lo
 *  calcola il server da quanto è stato pagato. */

export type StatoSpesa = 'DA_PAGARE' | 'PARZIALE' | 'PAGATA' | 'ANNULLATA';
export type MetodoPagamento = 'BONIFICO' | 'CONTANTI' | 'CARTA' | 'ALTRO';

export interface SpesaFornitore {
  id: string;
  fornitoreId: string;
  fornitoreNome: string;
  eventoId: string | null;
  eventoArtista: string | null;
  eventoData: string | null;
  busId: string | null;
  /** BUS = nata da un bus confermato (segue il costo finché non la tocchi). */
  origine: 'BUS' | 'MANUALE';
  descrizione: string;
  importo: number;
  pagato: number;
  residuo: number;
  stato: StatoSpesa;
  scaduta: boolean;
  inScadenza: boolean;
  numeroFattura: string | null;
  dataFattura: string | null;
  scadenza: string | null;
  fatturaUrl: string | null;
  note: string | null;
  annullata: boolean;
  numeroPagamenti: number;
}

export interface RiepilogoSpese {
  numero: number;
  totale: number;
  pagato: number;
  daPagare: number;
  scaduto: number;
  inScadenza: number;
  senzaFattura: number;
}

export interface SpesePerFornitore {
  fornitoreId: string;
  fornitoreNome: string;
  totale: number;
  pagato: number;
  daPagare: number;
}

export interface PagamentoSpesa {
  id: string;
  importo: string;
  pagatoIl: string;
  metodo: MetodoPagamento;
  riferimento: string | null;
  note: string | null;
  registratoDaNome: string | null;
}

export interface ElencoPagamentiFornitori {
  spese: SpesaFornitore[];
  riepilogo: RiepilogoSpese;
  perFornitore: SpesePerFornitore[];
  filtri: {
    fornitori: { id: string; nome: string }[];
    eventi: { id: string; artista: string; data: string }[];
  };
}

export interface FiltriSpese {
  stato?: StatoSpesa | 'SCADUTE';
  fornitoreId?: string;
  eventoId?: string;
  dal?: string;
  al?: string;
  testo?: string;
}

export interface SpesaInput {
  fornitoreId?: string;
  eventoId?: string | null;
  descrizione?: string;
  importo?: number;
  numeroFattura?: string | null;
  dataFattura?: string | null;
  scadenza?: string | null;
  fatturaUrl?: string | null;
  note?: string | null;
  annullata?: boolean;
}

export interface PagamentoInput {
  importo: number;
  pagatoIl: string;
  metodo: MetodoPagamento;
  riferimento?: string | null;
  note?: string | null;
}

function queryDaFiltri(filtri: FiltriSpese): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(filtri)) {
    if (valore) p.set(chiave, String(valore));
  }
  const testo = p.toString();
  return testo ? `?${testo}` : '';
}

export const pagamentiFornitoriApi = {
  elenco: (filtri: FiltriSpese = {}) =>
    api.get<ElencoPagamentiFornitori>(`/api/pagamenti-fornitori${queryDaFiltri(filtri)}`),
  pagamenti: (spesaId: string) => api.get<PagamentoSpesa[]>(`/api/pagamenti-fornitori/${spesaId}/pagamenti`),
  crea: (input: SpesaInput) => api.post<{ id: string }>('/api/pagamenti-fornitori', input),
  aggiorna: (id: string, input: SpesaInput) => api.put<{ id: string }>(`/api/pagamenti-fornitori/${id}`, input),
  elimina: (id: string) => api.delete<{ ok: true }>(`/api/pagamenti-fornitori/${id}`),
  registraPagamento: (spesaId: string, input: PagamentoInput) =>
    api.post<{ id: string }>(`/api/pagamenti-fornitori/${spesaId}/pagamenti`, input),
  eliminaPagamento: (pagamentoId: string) => api.delete<{ ok: true }>(`/api/pagamenti-fornitori/pagamenti/${pagamentoId}`),
};
