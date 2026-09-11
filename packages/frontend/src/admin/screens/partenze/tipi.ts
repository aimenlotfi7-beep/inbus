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

/** Il nome di ogni voce di Partenze, uguale nel menu, nel titolo
 *  dell'elenco e nel titolo della pagina del singolo evento. */
export const TITOLI_PARTENZE: Record<TabPartenze, string> = {
  fermate: 'Orari',
  preventivi: 'Preventivi',
  'da-prezzare': 'Prezzi',
  'da-confermare': 'Da confermare',
  confermato: 'Confermate',
  passate: 'Passate',
};

/** La voce di menu (sezione del gestionale) di ogni tappa. */
export const SEZIONE_PARTENZE: Record<TabPartenze, string> = {
  fermate: 'partenze-orari',
  preventivi: 'partenze-preventivi',
  'da-prezzare': 'partenze-prezzi',
  'da-confermare': 'partenze-da-confermare',
  confermato: 'partenze-confermato',
  passate: 'partenze-passate',
};

/** Il server dà questo numero di posti a un tragitto in vendita che non
 *  ha ancora nessun bus (si vende senza limite finché non si assegnano i
 *  bus veri): non va mai mostrato come numero. */
export const POSTI_SENZA_BUS = 999999;
