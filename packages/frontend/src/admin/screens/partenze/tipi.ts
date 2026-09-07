/** Tipi condivisi tra PartenzeScreen (che sceglie), SchedaEventoModale
 *  (che inoltra) e PartenzeTab (che usa) — prima erano dichiarati a
 *  mano in tre file: un cambio in uno rompeva gli altri in silenzio. */
export type TabPartenze = 'fermate' | 'preventivi' | 'da-prezzare' | 'da-confermare' | 'confermato' | 'passate';

export type AzionePartenze = 'fermate' | 'preventivo' | 'linee' | 'espandi';

export interface ContestoPartenze {
  tragittiIds: string[];
  azione: AzionePartenze;
  tabOrigine: TabPartenze;
}
