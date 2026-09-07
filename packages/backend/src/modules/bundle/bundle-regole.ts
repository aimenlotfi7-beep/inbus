/** Regole di COMPOSIZIONE di un acquisto bundle e calcolo dello sconto —
 *  pure, senza database, così sono testate a tavolino e usate identiche
 *  in creaOrdine. Vedi prompt Bundle, sezione 3. */
export interface BundleRegole {
  tipo: 'FISSO' | 'LIBERO';
  eventiIds: string[];
  minEventi: number | null;
  maxEventi: number | null;
  minPosti: number;
  maxPosti: number;
}

export interface ArticoloBundle { eventoId: string; passeggeri: number }

/** Torna il messaggio d'errore (italiano, per il cliente) o null se ok. */
export function verificaComposizione(regole: BundleRegole, articoli: ArticoloBundle[]): string | null {
  if (articoli.length === 0) return 'Il bundle non contiene nessun evento.';
  const ids = articoli.map((a) => a.eventoId);
  if (new Set(ids).size !== ids.length) return 'Ogni evento del bundle può comparire una sola volta.';
  const ammessi = new Set(regole.eventiIds);
  if (ids.some((id) => !ammessi.has(id))) return 'Uno degli eventi scelti non fa parte di questo bundle.';
  if (regole.tipo === 'FISSO') {
    if (ids.length !== regole.eventiIds.length) return 'Il bundle fisso include tutti i suoi eventi: non è possibile escluderne.';
  } else {
    const min = regole.minEventi ?? 1;
    if (ids.length < min) return `Scegli almeno ${min} eventi.`;
    if (regole.maxEventi != null && ids.length > regole.maxEventi) return `Puoi scegliere al massimo ${regole.maxEventi} eventi.`;
  }
  const passeggeri = articoli[0].passeggeri;
  if (articoli.some((a) => a.passeggeri !== passeggeri)) return 'Nel bundle il numero di passeggeri deve essere lo stesso per tutti gli eventi.';
  if (passeggeri < regole.minPosti) return `Il bundle richiede almeno ${regole.minPosti} passeggeri.`;
  if (passeggeri > regole.maxPosti) return `Il bundle ammette al massimo ${regole.maxPosti} passeggeri.`;
  return null;
}

/** Sconto per riga, in centesimi esatti: ogni riga prende la sua quota
 *  arrotondata, l'ULTIMA assorbe la differenza così la somma delle
 *  quote è esattamente lo sconto sul totale (niente centesimi persi o
 *  inventati). */
export function ripartisciSconto(importiBase: number[], percentuale: number): number[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totale = importiBase.reduce((a, b) => a + b, 0);
  const scontoTotale = round2(totale * percentuale / 100);
  const quote = importiBase.map((imp) => round2(imp * percentuale / 100));
  const sommaQuote = round2(quote.reduce((a, b) => a + b, 0));
  if (quote.length > 0) quote[quote.length - 1] = round2(quote[quote.length - 1] + (scontoTotale - sommaQuote));
  return quote;
}
