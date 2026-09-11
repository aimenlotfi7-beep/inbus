import { notifica } from '../../shared/notifiche';

/** Scaricamento CSV delle tabelle delle Statistiche, pensato per Excel in
 *  italiano: separatore ";", BOM UTF-8 (accenti corretti), numeri con la
 *  virgola. Stesso meccanismo dell'esportazione fermate in PartenzeTab. */

export type CellaCsv = string | number | boolean | null | undefined;

const BOM = String.fromCharCode(0xfeff);

function cellaCsv(valore: CellaCsv): string {
  if (valore === null || valore === undefined) return '';
  if (typeof valore === 'number') {
    if (!Number.isFinite(valore)) return '';
    return String(Math.round(valore * 100) / 100).replace('.', ',');
  }
  if (typeof valore === 'boolean') return valore ? 'sì' : 'no';
  // Un testo che comincia con = + - @, tabulazione o a capo Excel lo
  // prenderebbe per una formula.
  const testo = /^[=+\-@\t\r]/.test(valore) ? `'${valore}` : valore;
  return /[;"\n\r]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
}

/** Toglie gli accenti ("Città" → "Citta") per il nome del file. */
function senzaAccenti(testo: string): string {
  return Array.from(testo.normalize('NFD'))
    .filter((c) => {
      const codice = c.charCodeAt(0);
      return codice < 0x300 || codice > 0x36f;
    })
    .join('');
}

/** Nome leggibile, con il periodo quando c'è: "eventi-passati_2026-08-13_2026-09-11.csv". */
export function nomeFileCsv(base: string, periodo?: { dal: string; al: string } | null): string {
  const pulito = senzaAccenti(base)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'statistiche';
  return periodo ? `${pulito}_${periodo.dal}_${periodo.al}.csv` : `${pulito}.csv`;
}

export function scaricaCsv(nomeFile: string, intestazioni: string[], righe: CellaCsv[][]): void {
  const tutte: CellaCsv[][] = [intestazioni, ...righe];
  const testo = BOM + tutte.map((riga) => riga.map(cellaCsv).join(';')).join('\r\n');
  const blob = new Blob([testo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile.toLowerCase().endsWith('.csv') ? nomeFile : `${nomeFile}.csv`;
  a.click();
  // Liberato dopo un attimo: revocarlo subito può interrompere lo scaricamento.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notifica('File CSV scaricato: lo trovi tra i download.', 'info');
}
