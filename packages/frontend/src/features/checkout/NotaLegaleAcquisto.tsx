/** Cosa si accetta confermando un acquisto che si chiude qui, senza
 *  passare dal carrello del sito (prenotazione White Label, link e codice
 *  da incollare): l'impegno a pagare, niente recesso di 14 giorni per i
 *  viaggi a data fissa, le condizioni. Stesse frasi del carrello
 *  (CarrelloPage.tsx), perché valgono le stesse regole. I link si aprono
 *  in una scheda nuova: dentro il sito del cliente la pagina non deve
 *  andare altrove a metà acquisto. */
export function NotaLegaleAcquisto({ conPrivacy = false }: { conPrivacy?: boolean }) {
  return (
    <div className="blocco-legale">
      <p>Confermando ti impegni a pagare l'importo che scegli, secondo le modalità che ti comunicheremo via email.</p>
      <p>
        Per i viaggi con data fissa non vale il diritto di recesso di 14 giorni: leggi le{' '}
        <a href="/pagina/termini" target="_blank" rel="noopener">condizioni e la politica di cancellazione</a>.
      </p>
      {conPrivacy && (
        <p>I tuoi dati sono trattati secondo la nostra <a href="/pagina/privacy" target="_blank" rel="noopener">informativa privacy</a>.</p>
      )}
    </div>
  );
}
