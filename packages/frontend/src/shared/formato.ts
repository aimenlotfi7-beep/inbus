/** Prezzi in formato italiano ("96,00 €", "12.000,00 €") ovunque, invece
 *  di `€${n.toFixed(2)}` scritto a mano in ogni schermata ("€96.00"). */
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const euroInteri = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formattaEuro(valore: number | string | null | undefined, opzioni: { senzaDecimali?: boolean } = {}): string {
  const n = Number(valore ?? 0);
  return (opzioni.senzaDecimali ? euroInteri : euro).format(Number.isFinite(n) ? n : 0);
}
