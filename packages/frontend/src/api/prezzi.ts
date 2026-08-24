import type { Evento } from './types';

/** Prezzo minimo tra tutte le fermate prenotabili di un evento (quello
 *  che il cliente vedrebbe pagare di meno). Sostituisce il vecchio
 *  "prezzo base" dell'evento, ora che i prezzi arrivano dalle fermate
 *  delle tratte. Torna null se non c'è nessun prezzo impostato da
 *  nessuna parte (evento senza tratte, o tratte senza prezzi salvati). */
export function prezzoMinimoEvento(evento: Evento): number | null {
  const prezzi: number[] = [];
  const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)];
  for (const tragitto of tuttiITragitti) {
    for (const f of tragitto.fermate) {
      if (f.prezzo) prezzi.push(Number(f.prezzo));
    }
  }
  if (prezzi.length > 0) return Math.min(...prezzi);
  return evento.prezzo ? Number(evento.prezzo) : null;
}

/** Applica lo sconto percentuale di un'offerta a un prezzo normale — solo
 *  per MOSTRARLO al cliente: il calcolo che decide davvero quanto viene
 *  addebitato resta sul server (mai fidarsi di un prezzo calcolato nel
 *  browser). Scritta una sola volta qui invece che ripetuta in ogni
 *  punto dove serve mostrare un prezzo scontato. */
export function applicaScontoOfferta(prezzoNormale: number, scontoPercentuale: number | undefined): number {
  if (!scontoPercentuale) return prezzoNormale;
  return prezzoNormale * (1 - scontoPercentuale / 100);
}
