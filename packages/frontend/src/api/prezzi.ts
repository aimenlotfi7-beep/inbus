import type { Evento } from './types';

/** I prezzi (fermata + "prezzo extra" del tragitto, stessa formula del
 *  backend in shared/prezzi.ts) delle sole fermate che si possono comprare:
 *  tragitto attivo e in vendita, fermata accesa. Prima contavano anche le
 *  fermate spente e i tragitti non ancora in vendita, e il "da" poteva essere
 *  un prezzo che nessuno può pagare. */
function prezziVendibili(evento: Evento): number[] {
  const prezzi: number[] = [];
  const tuttiITragitti = [...evento.tragitti, ...evento.servizi.flatMap((v) => v.tragitti)];
  for (const tragitto of tuttiITragitti) {
    if (tragitto.attivo === false || tragitto.stato === 'DA_CONFERMARE') continue;
    const extra = Number(tragitto.prezzoExtra ?? 0);
    for (const f of tragitto.fermate) {
      if (f.attivo !== false && f.prezzo) prezzi.push(Number(f.prezzo) + extra);
    }
  }
  return prezzi;
}

/** Prezzo minimo tra le fermate prenotabili di un evento. Torna null se non
 *  c'è nessun prezzo impostato (evento senza tratte, o tratte senza prezzi). */
export function prezzoMinimoEvento(evento: Evento): number | null {
  const prezzi = prezziVendibili(evento);
  if (prezzi.length > 0) return Math.min(...prezzi);
  return evento.prezzo ? Number(evento.prezzo) : null;
}

/** Minimo e massimo insieme, per mostrare un intervallo ("da 35 € fino a
 *  90 €"): stesso criterio di prezzoMinimoEvento. */
export function intervalloPrezzoEvento(evento: Evento): { min: number; max: number } | null {
  const prezzi = prezziVendibili(evento);
  if (prezzi.length > 0) return { min: Math.min(...prezzi), max: Math.max(...prezzi) };
  if (evento.prezzo) { const p = Number(evento.prezzo); return { min: p, max: p }; }
  return null;
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
