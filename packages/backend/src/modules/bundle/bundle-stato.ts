/** Lo stato di un bundle non si salva: si CALCOLA da "attivo" e dalle
 *  date, qui e solo qui, così gestionale, sito e checkout non possono
 *  divergere. Le date sono istanti (UTC): il confronto con "adesso" non
 *  dipende dal fuso; il fuso conta solo per MOSTRARE le date (sempre
 *  timeZone 'Europe/Rome'). */
export type StatoBundle = 'BOZZA' | 'PROGRAMMATO' | 'IN_VENDITA' | 'VENDITA_TERMINATA' | 'DISATTIVATO';

export interface BundleDate {
  attivo: boolean;
  inizioVendita: Date | string | null;
  fineVendita: Date | string | null;
}

export function statoBundle(b: BundleDate, ora: Date = new Date()): StatoBundle {
  if (!b.attivo) return 'DISATTIVATO';
  if (!b.inizioVendita || !b.fineVendita) return 'BOZZA';
  const inizio = new Date(b.inizioVendita).getTime();
  const fine = new Date(b.fineVendita).getTime();
  const t = ora.getTime();
  if (t < inizio) return 'PROGRAMMATO';
  if (t > fine) return 'VENDITA_TERMINATA';
  return 'IN_VENDITA';
}

/** Visibile sul sito? IN_VENDITA sempre; PROGRAMMATO/TERMINATO solo se
 *  il bundle lo chiede; BOZZA e DISATTIVATO mai. */
export function bundleVisibile(b: BundleDate & { visibileSeProgrammato: boolean; visibileSeTerminato: boolean }, ora: Date = new Date()): boolean {
  const s = statoBundle(b, ora);
  if (s === 'IN_VENDITA') return true;
  if (s === 'PROGRAMMATO') return b.visibileSeProgrammato;
  if (s === 'VENDITA_TERMINATA') return b.visibileSeTerminato;
  return false;
}

export const ETICHETTA_STATO_BUNDLE: Record<StatoBundle, string> = {
  BOZZA: 'Bozza',
  PROGRAMMATO: 'Programmato',
  IN_VENDITA: 'In vendita',
  VENDITA_TERMINATA: 'Vendita terminata',
  DISATTIVATO: 'Disattivato',
};

/** Data/ora per il cliente e per il gestionale — sempre ora italiana,
 *  qualunque sia il fuso del server o del browser. */
export function formattaDataOraIt(d: Date | string): string {
  return new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
