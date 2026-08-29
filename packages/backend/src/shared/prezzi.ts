/**
 * Prezzo "normale" (senza sconti) di una fermata: il prezzo impostato
 * sulla fermata stessa (o il prezzo base dell'evento, se la fermata non
 * ne ha uno proprio), più l'extra della tratta — che si somma SEMPRE,
 * non solo quando la fermata non ha un prezzo proprio (prima "extra"
 * restava inerte per qualunque tragitto creato da un percorso salvato,
 * dato che li' ogni fermata ha sempre un prezzo/margine proprio
 * obbligatorio — il nome del campo, "extra", vuol dire "in aggiunta",
 * non "ripiego").
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
  const base = fermata?.prezzo ? Number(fermata.prezzo) : (evento?.prezzo ? Number(evento.prezzo) : 0);
  return base + Number(tragitto?.prezzoExtra ?? 0);
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
