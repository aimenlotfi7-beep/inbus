import type { Evento } from './types';

/** Prezzo minimo tra tutte le fermate prenotabili di un evento (quello
 *  che il cliente vedrebbe pagare di meno). Sostituisce il vecchio
 *  "prezzo base" dell'evento, ora che i prezzi arrivano dalle fermate
 *  delle tratte. Torna null se non c'è nessun prezzo impostato da
 *  nessuna parte (evento senza tratte, o tratte senza prezzi salvati). */
export function prezzoMinimoEvento(evento: Evento): number | null {
  const prezzi: number[] = [];
  for (const linea of evento.linee) {
    for (const f of linea.fermate) {
      if (f.prezzo) prezzi.push(Number(f.prezzo));
    }
  }
  if (prezzi.length > 0) return Math.min(...prezzi);
  return evento.prezzo ? Number(evento.prezzo) : null;
}
