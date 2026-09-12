/** Quando la richiesta non arriva al server (rete assente, server
 *  spento) fetch lancia un TypeError con un testo inglese ("Failed to
 *  fetch"): al cliente diciamo cosa succede e cosa fare. */
export const MESSAGGIO_CONNESSIONE = 'Non riusciamo a contattare il server: controlla la connessione e riprova.';

/** Il messaggio da mostrare per un errore del sito pubblico.
 *  - TypeError: la richiesta non è partita (o un errore di programma col
 *    suo testo inglese) → messaggio di connessione.
 *  - Ogni altro Error porta il testo del server: ErroreApi, ma anche
 *    ErroreClienteAuth (api/clienteAuth.ts) e l'Error di api/tourLeaderAuth.ts,
 *    che NON estendono ErroreApi ("Password errata", "Link scaduto"…). */
export function testoErrore(e: unknown): string {
  if (e instanceof TypeError) return MESSAGGIO_CONNESSIONE;
  if (e instanceof Error && e.message) return e.message;
  return MESSAGGIO_CONNESSIONE;
}
