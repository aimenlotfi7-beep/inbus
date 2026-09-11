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
  const ora = new Date(data).toLocaleTimeString('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  return `${formattaData(data)} ${ora}`;
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
