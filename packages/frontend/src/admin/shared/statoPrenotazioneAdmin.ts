/** Lo stato di una prenotazione nel gestionale, uguale ovunque (Prenotazioni
 *  e scheda del cliente in Clienti): prima la scheda cliente ne mostrava 2 e
 *  Prenotazioni 4. Verde "Confermata" chi paga tutto subito; giallo
 *  "Acconto" chi ha versato solo l'acconto; blu "Saldata" chi ha pagato ad
 *  acconto e poi saldato; rosso "Cancellata". */
export function statoPrenotazioneAdmin(r: { stato: string; tipoPagamento: string; saldoPagato: boolean }): { classe: string; etichetta: string } {
  if (r.stato === 'CANCELLATA') return { classe: 'non-coperta', etichetta: 'Cancellata' };
  if (r.tipoPagamento === 'ACCONTO' && !r.saldoPagato) return { classe: 'attenzione', etichetta: 'Acconto' };
  if (r.tipoPagamento === 'ACCONTO' && r.saldoPagato) return { classe: 'saldata', etichetta: 'Saldata' };
  return { classe: 'coperta', etichetta: 'Confermata' };
}
