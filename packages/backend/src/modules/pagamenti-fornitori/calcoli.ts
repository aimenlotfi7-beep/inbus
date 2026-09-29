/** Conti puri dei pagamenti ai fornitori (niente database qui dentro:
 *  così le regole si possono provare da sole, vedi calcoli.test.ts).
 *  Lo stato di una spesa non è una colonna del database: si ricava
 *  sempre da quanto è stato pagato, così non può restare indietro. */

export type StatoSpesa = 'DA_PAGARE' | 'PARZIALE' | 'PAGATA' | 'ANNULLATA';

export interface SpesaDaValutare {
  importo: number;
  pagato: number;
  annullata: boolean;
  /** Scadenza della fattura, se c'è. */
  scadenza: Date | null;
}

/** Un centesimo di tolleranza: gli arrotondamenti di più pagamenti
 *  parziali non devono lasciare una spesa "quasi pagata" per sempre. */
const TOLLERANZA = 0.005;

export function statoSpesa(s: SpesaDaValutare): StatoSpesa {
  if (s.annullata) return 'ANNULLATA';
  if (s.pagato >= s.importo - TOLLERANZA) return 'PAGATA';
  return s.pagato > TOLLERANZA ? 'PARZIALE' : 'DA_PAGARE';
}

/** Quanto resta da pagare: mai negativo (se si è pagato più del dovuto
 *  il residuo è zero, la differenza si vede nei pagamenti registrati). */
export function residuoSpesa(s: SpesaDaValutare): number {
  if (s.annullata) return 0;
  return Math.max(0, arrotonda(s.importo - s.pagato));
}

/** In ritardo = c'era una scadenza, è passata, e qualcosa resta da pagare. */
export function spesaScaduta(s: SpesaDaValutare, oggi: Date): boolean {
  return !!s.scadenza && s.scadenza < oggi && residuoSpesa(s) > 0;
}

/** In scadenza = si paga entro i prossimi `giorni` giorni (oggi compreso). */
export function spesaInScadenza(s: SpesaDaValutare, oggi: Date, giorni: number): boolean {
  if (!s.scadenza || residuoSpesa(s) <= 0 || s.scadenza < oggi) return false;
  const limite = new Date(oggi.getTime() + giorni * 24 * 60 * 60 * 1000);
  return s.scadenza <= limite;
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

/** I numeri in cima alla schermata, calcolati sulle stesse spese che si
 *  vedono nell'elenco (tolte quelle annullate, che non si pagano più). */
export function riepilogo(
  spese: (SpesaDaValutare & { haFattura: boolean })[],
  oggi: Date,
  giorniInScadenza = 7,
): RiepilogoSpese {
  const vive = spese.filter((s) => !s.annullata);
  return {
    numero: vive.length,
    totale: arrotonda(vive.reduce((t, s) => t + s.importo, 0)),
    pagato: arrotonda(vive.reduce((t, s) => t + Math.min(s.pagato, s.importo), 0)),
    daPagare: arrotonda(vive.reduce((t, s) => t + residuoSpesa(s), 0)),
    scaduto: arrotonda(vive.filter((s) => spesaScaduta(s, oggi)).reduce((t, s) => t + residuoSpesa(s), 0)),
    inScadenza: arrotonda(vive.filter((s) => spesaInScadenza(s, oggi, giorniInScadenza)).reduce((t, s) => t + residuoSpesa(s), 0)),
    senzaFattura: vive.filter((s) => !s.haFattura).length,
  };
}

/** Quanto si deve ancora a ogni fornitore, dal più alto. */
export function perFornitore<T extends SpesaDaValutare & { fornitoreId: string; fornitoreNome: string }>(spese: T[]) {
  const mappa = new Map<string, { fornitoreId: string; fornitoreNome: string; totale: number; pagato: number; daPagare: number }>();
  for (const s of spese) {
    if (s.annullata) continue;
    const riga = mappa.get(s.fornitoreId) ?? { fornitoreId: s.fornitoreId, fornitoreNome: s.fornitoreNome, totale: 0, pagato: 0, daPagare: 0 };
    riga.totale = arrotonda(riga.totale + s.importo);
    riga.pagato = arrotonda(riga.pagato + Math.min(s.pagato, s.importo));
    riga.daPagare = arrotonda(riga.daPagare + residuoSpesa(s));
    mappa.set(s.fornitoreId, riga);
  }
  return [...mappa.values()].sort((a, b) => b.daPagare - a.daPagare || b.totale - a.totale);
}

function arrotonda(n: number): number {
  return Math.round(n * 100) / 100;
}
