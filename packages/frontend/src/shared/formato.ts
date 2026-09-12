/** Prezzi in formato italiano ("96,00 €", "12.000,00 €") ovunque, invece
 *  di `€${n.toFixed(2)}` scritto a mano in ogni schermata ("€96.00"). */
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const euroInteri = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formattaEuro(valore: number | string | null | undefined, opzioni: { senzaDecimali?: boolean } = {}): string {
  const n = Number(valore ?? 0);
  return (opzioni.senzaDecimali ? euroInteri : euro).format(Number.isFinite(n) ? n : 0);
}

/** "1 fermata", "3 fermate": il numero con la parola giusta, invece di
 *  "fermata/e" o "1 fermate" scritti a mano. */
export function plurale(n: number, singolare: string, formaPlurale: string): string {
  return `${n} ${n === 1 ? singolare : formaPlurale}`;
}

/** Date e ore sempre con due cifre e senza secondi ("09/10/2026",
 *  "09/10/2026, 14:30"), uguali in tutto il gestionale. */
const data = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataOra = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formattaData(valore: string | number | Date): string {
  const d = new Date(valore);
  return Number.isNaN(d.getTime()) ? '—' : data.format(d);
}

export function formattaDataOra(valore: string | number | Date): string {
  const d = new Date(valore);
  return Number.isNaN(d.getTime()) ? '—' : dataOra.format(d);
}

/** Giorni di calendario (ora di Roma) da oggi alla data di un evento:
 *  0 = oggi, 1 = domani, negativo = passato. La data dell'evento è salvata
 *  a mezzanotte UTC: con la differenza in ore (Math.ceil) tra mezzanotte e
 *  le 2 di notte un viaggio di oggi risultava "domani". */
const giornoRoma = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
export function giorniAllaData(valore: string | number | Date, ora: Date = new Date()): number {
  const d = new Date(valore);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  const giorno = (x: Date) => { const [a, m, g] = giornoRoma.format(x).split('-').map(Number); return Date.UTC(a, m - 1, g); };
  return Math.round((giorno(d) - giorno(ora)) / 86400000);
}
