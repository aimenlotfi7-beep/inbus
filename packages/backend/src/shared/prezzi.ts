/**
 * Prezzo "normale" (senza sconti) di una fermata: quello impostato sulla
 * fermata stessa, oppure — se non impostato — il prezzo base dell'evento
 * più l'extra della tratta.
 *
 * Scritta qui apposta, una sola volta: prima questa stessa formula era
 * ripetuta in tre punti diversi del codice (opzioni di partenza, nuova
 * prenotazione, calcolo del saldo residuo). Se un domani cambia la
 * regola dei prezzi, va cambiata solo qui — non c'è più il rischio che
 * una copia venga aggiornata e un'altra dimenticata (è successo con lo
 * sconto delle offerte sul saldo residuo).
 */
export function prezzoNormaleFermata(
  fermata: { prezzo: string | null } | undefined,
  evento: { prezzo: string | null } | undefined,
  tragitto: { prezzoExtra: string } | undefined,
): number {
  if (fermata?.prezzo) return Number(fermata.prezzo);
  return (evento?.prezzo ? Number(evento.prezzo) : 0) + Number(tragitto?.prezzoExtra ?? 0);
}

/**
 * Applica lo sconto percentuale di un'offerta a un prezzo normale.
 * Stessa storia: prima questa formula era scritta due volte separate
 * dentro le prenotazioni (crea + calcolo saldo residuo) — è esattamente
 * lì che era nato il bug dello sconto non applicato al saldo.
 */
export function applicaScontoOfferta(prezzoNormale: number, offerta: { scontoPercentuale: string } | undefined | null): number {
  if (!offerta) return prezzoNormale;
  return prezzoNormale * (1 - Number(offerta.scontoPercentuale) / 100);
}
