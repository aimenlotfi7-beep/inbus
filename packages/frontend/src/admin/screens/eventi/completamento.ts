import type { EventoInput } from '../../../api/eventi';

/** Completamento VERO di ogni sezione della scheda evento — non "ci
 *  sono passato sopra", ma "ho scritto qualcosa lì dentro". Funzioni
 *  pure sul form, condivise tra il genitore (spunte del wizard, blocchi
 *  al salvataggio) e i singoli passi. Non bloccano mai da sole: tratte,
 *  immagini e descrizione restano facoltative. */
export function infoCompleta(form: EventoInput): boolean {
  return Boolean(form.artista && form.genere && form.luogo && form.citta && form.data);
}
export function numeroImmagini(form: EventoInput): number {
  return (form.immagini ?? []).length;
}
export function bigliettoPersonalizzato(form: EventoInput): boolean {
  return Boolean(form.ticketColoreAccento || form.ticketImmagineSfondoUrl || form.layoutBigliettoId);
}
export function descrizioneCompilata(form: EventoInput): boolean {
  return Boolean((form.descrizione ?? '').trim() || (form.descrizioneSeo ?? '').trim());
}
