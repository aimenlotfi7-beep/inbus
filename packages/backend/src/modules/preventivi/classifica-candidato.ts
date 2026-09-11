/** La regola di chi riceve la mail — pura, senza database, così si può
 *  testare a tavolino. Decisa in conversazione:
 *  - il fornitore già ACCETTATO per questo tragitto rientra sempre tra
 *    le opzioni (è quello di fiducia, ha senso richiedergli);
 *  - chi è già stato contattato per questo tragitto e non scelto resta
 *    visibile ma oscurato — niente mail automatica, non selezionabile;
 *    per un cambio di percorso invece si può scegliere di nuovo (il suo
 *    prezzo valeva per il percorso di prima);
 *  - chi non è mai stato contattato: automatico se ha il flag, altrimenti
 *    in lista manuale. */
export type StatoCandidato = 'automatico' | 'manuale' | 'gia_contattato' | 'accettato_in_precedenza';

export function classificaCandidato(
  fornitore: { id: string; invioAutomatico: boolean },
  contesto: { fornitoreAccettatoId: string | null; contattatiIds: ReadonlySet<string> },
): StatoCandidato {
  if (fornitore.id === contesto.fornitoreAccettatoId) return 'accettato_in_precedenza';
  if (contesto.contattatiIds.has(fornitore.id)) return 'gia_contattato';
  return fornitore.invioAutomatico ? 'automatico' : 'manuale';
}

/** Chi riceve davvero la mail, dati i candidati classificati e la
 *  selezione manuale dell'admin. Anche questa pura, per lo stesso motivo. */
export function destinatariRichiesta<T extends { id: string; statoCandidato: StatoCandidato }>(
  candidati: T[],
  manualiSceltiIds: ReadonlySet<string>,
  opzioni: { cambioPercorso?: boolean } = {},
): { automatici: T[]; manuali: T[] } {
  const selezionabili: StatoCandidato[] = opzioni.cambioPercorso
    ? ['manuale', 'accettato_in_precedenza', 'gia_contattato']
    : ['manuale', 'accettato_in_precedenza'];
  return {
    automatici: candidati.filter((c) => c.statoCandidato === 'automatico'),
    manuali: candidati.filter((c) => manualiSceltiIds.has(c.id) && selezionabili.includes(c.statoCandidato)),
  };
}
