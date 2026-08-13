import { api } from './client';

export interface StatisticheGenerali {
  incassoTotale: number;
  numeroPrenotazioni: number;
  numeroEventi: number;
}
export interface ConfrontoMesi {
  meseCorrente: number;
  mesePrecedente: number;
}

export const statisticheApi = {
  generali: () => api.get<StatisticheGenerali>('/api/statistiche/generali'),
  confrontoMesi: () => api.get<ConfrontoMesi>('/api/statistiche/confronto-mesi'),
};
