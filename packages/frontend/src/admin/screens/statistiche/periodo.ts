import type { Confronto } from '../../../api/statistiche';
import { formattaData, plurale } from '../../../shared/formato';

/** Filtro del periodo delle Statistiche: preset, giorni di calendario di Roma
 *  ("YYYY-MM-DD", entrambi compresi) e preferenze ricordate nel browser. */

export type PresetPeriodo = 'ultimi-30' | 'ultimi-90' | 'inizio-anno' | 'ultimi-12-mesi' | 'personalizzato';

export const PRESET_PERIODO: { id: PresetPeriodo; etichetta: string }[] = [
  { id: 'ultimi-30', etichetta: 'Ultimi 30 giorni' },
  { id: 'ultimi-90', etichetta: 'Ultimi 90 giorni' },
  { id: 'inizio-anno', etichetta: 'Da inizio anno' },
  { id: 'ultimi-12-mesi', etichetta: 'Ultimi 12 mesi' },
  { id: 'personalizzato', etichetta: 'Personalizzato' },
];

export const OPZIONI_CONFRONTO: { id: Confronto; etichetta: string }[] = [
  { id: 'anno', etichetta: "Stesso periodo dell'anno prima" },
  { id: 'precedente', etichetta: 'Periodo precedente' },
  { id: 'nessuno', etichetta: 'Nessun confronto' },
];

/** Il periodo su cui il server ha fatto davvero i conti. */
export interface PeriodoRisolto {
  dal: string;
  al: string;
  confrontoDal: string | null;
  confrontoAl: string | null;
}

/** Cosa scrivere accanto ai filtri: il periodo della risposta, "il periodo
 *  non conta" (scheda di un evento) o niente (dati in arrivo). */
export type InfoPeriodo = PeriodoRisolto | 'non-applicabile' | null;

const FORMATO_ROMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Oggi a Roma, qualunque sia il fuso del computer. */
export function oggiRoma(adesso: Date = new Date()): string {
  const parti = FORMATO_ROMA.formatToParts(adesso);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => parti.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

function leggiGiorno(valore: string): { anno: number; mese: number; giorno: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valore);
  if (!m) return null;
  const anno = Number(m[1]);
  const mese = Number(m[2]);
  const giorno = Number(m[3]);
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  if (d.getUTCFullYear() !== anno || d.getUTCMonth() !== mese - 1 || d.getUTCDate() !== giorno) return null;
  return { anno, mese, giorno };
}

function scriviGiorno(d: Date): string {
  const anno = String(d.getUTCFullYear()).padStart(4, '0');
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

export function giornoValido(valore: string): boolean {
  return leggiGiorno(valore) !== null;
}

/** Aritmetica sui giorni di calendario (in UTC, così l'ora legale non sposta nulla). */
export function aggiungiGiorni(valore: string, giorni: number): string {
  const p = leggiGiorno(valore);
  return p ? scriviGiorno(new Date(Date.UTC(p.anno, p.mese - 1, p.giorno + giorni))) : valore;
}

/** Stesso giorno n anni dopo (o prima); il 29 febbraio diventa il 28 se serve. */
export function aggiungiAnni(valore: string, anni: number): string {
  const p = leggiGiorno(valore);
  if (!p) return valore;
  const ultimoDelMese = new Date(Date.UTC(p.anno + anni, p.mese, 0)).getUTCDate();
  return scriviGiorno(new Date(Date.UTC(p.anno + anni, p.mese - 1, Math.min(p.giorno, ultimoDelMese))));
}

export function periodoDaPreset(preset: PresetPeriodo, oggi: string): { dal: string; al: string } {
  if (preset === 'ultimi-90') return { dal: aggiungiGiorni(oggi, -89), al: oggi };
  if (preset === 'inizio-anno') return { dal: `${oggi.slice(0, 4)}-01-01`, al: oggi };
  if (preset === 'ultimi-12-mesi') return { dal: aggiungiGiorni(aggiungiAnni(oggi, -1), 1), al: oggi };
  // "Ultimi 30 giorni", e ripiego per "Personalizzato" senza date.
  return { dal: aggiungiGiorni(oggi, -29), al: oggi };
}

/** Controllo delle date personalizzate: null se vanno bene. */
export function erroreIntervallo(dal: string, al: string): string | null {
  if (!dal || !al) return 'Scegli la data di inizio e quella di fine.';
  if (!giornoValido(dal) || !giornoValido(al)) return 'Una delle due date non è valida.';
  if (al < dal) return "La data di fine non può venire prima di quella d'inizio.";
  if (al >= aggiungiAnni(dal, 3)) return 'Il periodo può durare al massimo 3 anni.';
  return null;
}

const DATA_ROMA = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome',
});

/** "11/09/2026" da un giorno "YYYY-MM-DD" (senza slittamenti di fuso) o da una
 *  data completa: questa si legge nel fuso di Roma, dove l'evento è salvato a
 *  mezzanotte, qualunque sia il fuso del computer. */
export function formattaGiorno(valore: string | null | undefined): string {
  if (!valore) return '—';
  const p = leggiGiorno(valore);
  if (p) return formattaData(new Date(p.anno, p.mese - 1, p.giorno, 12));
  const data = new Date(valore);
  return Number.isNaN(data.getTime()) ? '—' : DATA_ROMA.format(data);
}

/** "oggi", "tra 12 giorni", "3 giorni fa". */
export function giorniRelativi(giorni: number): string {
  if (giorni === 0) return 'oggi';
  return giorni > 0 ? `tra ${plurale(giorni, 'giorno', 'giorni')}` : `${plurale(-giorni, 'giorno', 'giorni')} fa`;
}

export function testoPeriodo(p: PeriodoRisolto): string {
  const base = `Dal ${formattaGiorno(p.dal)} al ${formattaGiorno(p.al)}`;
  return p.confrontoDal && p.confrontoAl
    ? `${base} · confronto dal ${formattaGiorno(p.confrontoDal)} al ${formattaGiorno(p.confrontoAl)}`
    : base;
}

// ---------------------------------------------------------------- Preferenze

const CHIAVE_PREFERENZE = 'inbus_admin_statistiche';

export interface PreferenzeStatistiche {
  scheda: string;
  preset: PresetPeriodo;
  dal: string;
  al: string;
  confronto: Confronto;
}

export function leggiPreferenze(): Partial<PreferenzeStatistiche> {
  try {
    const grezzo = localStorage.getItem(CHIAVE_PREFERENZE);
    if (!grezzo) return {};
    const letto: unknown = JSON.parse(grezzo);
    if (!letto || typeof letto !== 'object') return {};
    const o = letto as Record<string, unknown>;
    const risultato: Partial<PreferenzeStatistiche> = {};
    if (typeof o.scheda === 'string') risultato.scheda = o.scheda;
    if (PRESET_PERIODO.some((p) => p.id === o.preset)) risultato.preset = o.preset as PresetPeriodo;
    if (typeof o.dal === 'string' && giornoValido(o.dal)) risultato.dal = o.dal;
    if (typeof o.al === 'string' && giornoValido(o.al)) risultato.al = o.al;
    if (OPZIONI_CONFRONTO.some((c) => c.id === o.confronto)) risultato.confronto = o.confronto as Confronto;
    return risultato;
  } catch {
    return {};
  }
}

export function salvaPreferenze(preferenze: PreferenzeStatistiche): void {
  try {
    localStorage.setItem(CHIAVE_PREFERENZE, JSON.stringify(preferenze));
  } catch {
    // Archivio del browser pieno o bloccato: alla prossima apertura valgono i valori predefiniti.
  }
}
