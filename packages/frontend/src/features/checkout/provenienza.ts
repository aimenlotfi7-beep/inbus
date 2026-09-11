/** Chi ha portato il cliente fin qui, letto dall'indirizzo della pagina: il
 *  codice promoter (?promo=) e i parametri delle campagne (?utm_…). I campi
 *  assenti restano undefined, così spariscono dai dati inviati. Serve sia al
 *  checkout singolo (al momento dell'invio) sia al carrello (quando un
 *  articolo ci entra, perché su /carrello l'indirizzo è un altro). */
export function provenienzaDaUrl(search: string = window.location.search) {
  const parametri = new URLSearchParams(search);
  const valore = (chiave: string) => parametri.get(chiave) || undefined;
  return {
    promoterCodice: valore('promo'),
    utmSource: valore('utm_source'),
    utmMedium: valore('utm_medium'),
    utmCampaign: valore('utm_campaign'),
    utmContent: valore('utm_content'),
  };
}
