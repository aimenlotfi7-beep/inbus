/** Formati usati nei testi delle email (e in altri messaggi per persone):
 *  un solo posto, così ogni email mostra date e prezzi allo stesso modo.
 *  Le date sempre nel fuso italiano — il server (Railway) gira in UTC. */

const FUSO = 'Europe/Rome';
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** "96,00 €" — stesso formato di formattaEuro() nel frontend. */
export function formattaEuro(valore: number | string | null | undefined): string {
  const n = Number(valore ?? 0);
  return euro.format(Number.isFinite(n) ? n : 0);
}

/** "05/09/2026" */
export function formattaData(data: Date | string): string {
  return new Date(data).toLocaleDateString('it-IT', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "05/09/2026 21:00" */
export function formattaDataOra(data: Date | string): string {
  return `${formattaData(data)} ${formattaOra(data)}`;
}

/** "21:00" — solo l'ora, sull'orologio di Roma. */
export function formattaOra(data: Date | string): string {
  return new Date(data).toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}

// Le cifre di un istante lette sull'orologio di Roma: la base per passare
// dall'orario "scritto" di una fermata (18:30) all'istante vero, e ritorno.
const cifreRoma = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function leggiCifreRoma(istante: number) {
  const cifre: Record<string, number> = {};
  for (const parte of cifreRoma.formatToParts(new Date(istante))) {
    if (parte.type !== 'literal') cifre[parte.type] = Number(parte.value);
  }
  return { anno: cifre.year, mese: cifre.month, giorno: cifre.day, ore: cifre.hour % 24, minuti: cifre.minute, secondi: cifre.second };
}

/** Di quanti millisecondi l'orologio di Roma è avanti su UTC in
 *  quell'istante: un'ora d'inverno, due con l'ora legale. */
function scartoRomaMs(istante: number): number {
  const c = leggiCifreRoma(istante);
  return Date.UTC(c.anno, c.mese - 1, c.giorno, c.ore, c.minuti, c.secondi) - Math.floor(istante / 1000) * 1000;
}

/** Il giorno di calendario a Roma di un istante (le 23:30 UTC sono già
 *  il giorno dopo, a Roma). */
export function giornoARoma(data: Date | string): { anno: number; mese: number; giorno: number } {
  const c = leggiCifreRoma(new Date(data).getTime());
  return { anno: c.anno, mese: c.mese, giorno: c.giorno };
}

/** L'istante vero di un giorno e di un orario letti sull'orologio di Roma:
 *  il 5/09/2026 alle 18:30 di Roma sono le 16:30 UTC (d'inverno le 17:30).
 *  Il server gira in UTC: mai usare setHours() per questo calcolo. */
export function istanteOraRoma(anno: number, mese: number, giorno: number, ore: number, minuti: number): Date {
  const comeSeFosseUtc = Date.UTC(anno, mese - 1, giorno, ore, minuti);
  const stima = comeSeFosseUtc - scartoRomaMs(comeSeFosseUtc);
  // Seconda passata: a cavallo del cambio dell'ora legale lo scarto giusto
  // è quello dell'istante stimato, non quello di partenza.
  return new Date(comeSeFosseUtc - scartoRomaMs(stima));
}

/** Legge un orario scritto a mano ("18:30", "8.05", "18:30:00"); null se
 *  non è un orario valido. */
export function leggiOrario(testo: string | null | undefined): { ore: number; minuti: number } | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?\s*$/.exec(testo ?? '');
  if (!m) return null;
  const ore = Number(m[1]);
  const minuti = Number(m[2]);
  return ore <= 23 && minuti <= 59 ? { ore, minuti } : null;
}

/** "08:05" da un orario scritto a mano; null se non è un orario valido. */
export function orarioLeggibile(testo: string | null | undefined): string | null {
  const o = leggiOrario(testo);
  return o ? `${String(o.ore).padStart(2, '0')}:${String(o.minuti).padStart(2, '0')}` : null;
}

/** Per i valori scritti da persone (nomi, indirizzi, descrizioni,
 *  motivi) che finiscono dentro l'HTML di un'email: un "<" in un nome
 *  non deve diventare un tag. Mai da usare sui link. */
export function escapaHtml(valore: string | null | undefined): string {
  return String(valore ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
