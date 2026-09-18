import { api } from './client';

/** Responsabili operativi degli eventi e loro compensi (server:
 *  modules/collaboratori). Il compenso si sceglie evento per evento. */

export type TipoCompenso = 'FISSO' | 'PERCENTUALE_INCASSO' | 'PERCENTUALE_MARGINE';

export const NOMI_TIPO_COMPENSO: Record<TipoCompenso, string> = {
  FISSO: 'Fisso in euro',
  PERCENTUALE_INCASSO: "Percentuale sull'incasso",
  PERCENTUALE_MARGINE: 'Percentuale sul margine',
};

export interface CompensoEvento {
  eventoId: string;
  artista: string;
  citta: string;
  data: string;
  /** Evento passato: "a oggi" è il compenso definitivo. */
  concluso: boolean;
  amministratoreId: string;
  responsabile: string;
  compensoTipo: TipoCompenso;
  compensoValore: number;
  /** "300 € fisso", "8% sull'incasso". */
  regola: string;
  previsto: number;
  aOggi: number;
  pagatoIl: string | null;
  importoPagato: number | null;
}

/** "Il mio compenso": gli stessi dati senza chi è il responsabile (è lui). */
export type MioCompenso = Omit<CompensoEvento, 'amministratoreId' | 'responsabile'>;

export interface PossibileResponsabile {
  id: string;
  nome: string;
  email: string;
  soloEventiAssegnati: boolean;
}

export const collaboratoriApi = {
  miei: () => api.get<MioCompenso[]>('/api/collaboratori/miei'),
  compensi: () => api.get<CompensoEvento[]>('/api/collaboratori/compensi'),
  responsabili: () => api.get<PossibileResponsabile[]>('/api/collaboratori/responsabili'),
  diEvento: (eventoId: string) => api.get<CompensoEvento | null>(`/api/collaboratori/evento/${eventoId}`),
  assegna: (eventoId: string, dati: { amministratoreId: string; compensoTipo: TipoCompenso; compensoValore: number }) =>
    api.put<CompensoEvento>(`/api/collaboratori/evento/${eventoId}`, dati),
  togli: (eventoId: string) => api.delete<void>(`/api/collaboratori/evento/${eventoId}`),
  segnaPagato: (eventoId: string, importo?: number) => api.post<CompensoEvento>(`/api/collaboratori/evento/${eventoId}/pagato`, importo === undefined ? {} : { importo }),
  annullaPagato: (eventoId: string) => api.delete<CompensoEvento | null>(`/api/collaboratori/evento/${eventoId}/pagato`),
};
