import { GRUPPI, type SezioneGestionale } from './AdminLayout';

/** La ricerca della home trova anche le sezioni del gestionale, non solo
 *  eventi e clienti (proprietario, ottobre 2026: con 11 gruppi arrivare a
 *  una voce voleva dire scorrere il menu). Niente database e niente
 *  chiamate: si filtra l'elenco del menu mentre si scrive. */

export interface SezioneTrovata {
  id: SezioneGestionale;
  /** L'etichetta come appare nel menu. */
  label: string;
  /** Il gruppo del menu, mostrato sotto l'etichetta per orientarsi. */
  gruppo: string;
}

/** Altri modi di chiamare una sezione: il nome vecchio, il sinonimo che
 *  viene in mente, la parola che ci si aspetta di trovare. Senza questi,
 *  "voucher" o "preventivi" non troverebbero nulla. */
const ALTRI_NOMI: Partial<Record<SezioneGestionale, string[]>> = {
  coupon: ['voucher', 'sconti', 'codice sconto', 'buoni'],
  'partenze-preventivi': ['preventivi', 'richieste fornitori'],
  'partenze-da-confermare': ['proposte', 'bus da confermare'],
  'partenze-orari': ['fermate degli eventi', 'arrivo'],
  transazioni: ['ordini', 'vendite', 'transazioni', 'pnr'],
  pagamenti: ['acconti', 'saldi', 'incassi'],
  utenti: ['utenti', 'anagrafica clienti'],
  rimborsi: ['storni', 'richieste di rimborso'],
  'lista-attesa': ['attesa', 'waiting'],
  variazioni: ['cambi orario', 'avvisi ai clienti'],
  comunicazioni: ['email ai clienti', 'avvisi'],
  'pagamenti-fornitori': ['fatture', 'spese', 'scadenze', 'da pagare'],
  fornitori: ['autolinee', 'noleggio'],
  'white-label': ['widget', 'codice da incollare', 'embed'],
  tragitti: ['percorsi salvati'],
  fermate: ['anagrafica fermate'],
  'beta-tragitti-vicini': ['tragitti vicini'],
  compensi: ['collaboratori', 'responsabili'],
  'mio-compenso': ['il mio compenso'],
  amministratori: ['utenze', 'staff', 'accessi'],
  ruoli: ['permessi'],
  'template-email': ['modelli email', 'testo delle email'],
  'testi-tooltip': ['tooltip', 'spiegazioni'],
  'layout-biglietto': ['biglietto'],
  contenuti: ['pagine', 'faq', 'sito'],
  tracciamento: ['pixel', 'ga4', 'analytics', 'meta'],
  statistiche: ['andamento', 'numeri', 'report'],
  cestino: ['eliminati'],
  vetrina: ['in evidenza', 'home del sito'],
};

/** Senza accenti e in minuscolo: "lista d'attesa" si trova scrivendo
 *  "attesa", "Promozioni" scrivendo "promo". */
function semplifica(testo: string): string {
  return testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Le sezioni che corrispondono a quello che si sta scrivendo, solo tra
 *  quelle che l'utente può vedere. Prima quelle che iniziano con il
 *  testo cercato, poi le altre; al massimo `quante`. */
export function cercaSezioni(
  query: string,
  puoVedere: (sezione: SezioneGestionale) => boolean,
  quante = 6,
): SezioneTrovata[] {
  const q = semplifica(query.trim());
  if (q.length < 2) return [];

  const candidate = GRUPPI.flatMap((gruppo) =>
    gruppo.voci.filter((v) => puoVedere(v.id)).map((v) => ({ id: v.id, label: v.label, gruppo: gruppo.titolo })));

  const punteggio = (s: SezioneTrovata): number => {
    const nomi = [s.label, s.gruppo, ...(ALTRI_NOMI[s.id] ?? [])].map(semplifica);
    if (nomi.some((n) => n.startsWith(q))) return 0; // "rimb" → Rimborsi
    if (nomi.some((n) => n.split(/[\s'’]+/).some((parola) => parola.startsWith(q)))) return 1; // "attesa" → Lista d'attesa
    if (nomi.some((n) => n.includes(q))) return 2;
    return -1;
  };

  return candidate
    .map((s) => ({ s, p: punteggio(s) }))
    .filter(({ p }) => p >= 0)
    .sort((a, b) => a.p - b.p || a.s.label.localeCompare(b.s.label, 'it'))
    .slice(0, quante)
    .map(({ s }) => s);
}
