import rateLimit from 'express-rate-limit';

/**
 * Limita quante richieste può fare lo stesso indirizzo IP in una
 * finestra di tempo, solo sugli endpoint pubblici più sensibili agli
 * abusi automatizzati — non tocca il resto del sito (letture normali,
 * navigazione), che non ne ha bisogno.
 *
 * Perché serve: senza questo, chiunque potrebbe scrivere uno script
 * che manda migliaia di richieste di reset password all'email di
 * qualcun altro (bombing), o provare migliaia di password diverse sul
 * login (forza bruta), o riempire l'anagrafica clienti di account
 * finti in pochi secondi — tutte cose che oggi non avevano NESSUN
 * freno tecnico, solo la buona fede di chi usa il sito.
 */

/** Login e reset password — tentativi ripetuti in poco tempo sono quasi
 *  sempre un attacco, non un utente vero che sbaglia la password 10
 *  volte in un minuto. */
export const limiteAutenticazione = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi da questo indirizzo — riprova tra qualche minuto.' },
});

/** Registrazione nuovo account — più permissivo del login (non è un
 *  tentativo "sbagliato", ma comunque va limitato per evitare account
 *  finti creati in massa da uno script. */
export const limiteRegistrazione = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ora
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppe registrazioni da questo indirizzo — riprova più tardi.' },
});

/** Le route che cercano una prenotazione per PNR (GET /:pnr, saldo,
 *  ecc.) non richiedono login — si affidano al PNR stesso come unica
 *  "chiave". Anche con un PNR ora molto più lungo e imprevedibile
 *  (vedi generaPnr), un limite qui resta una barriera in più contro
 *  chi provasse comunque a scriverne a raffica — un cliente vero non
 *  ha bisogno di controllare la stessa prenotazione centinaia di volte
 *  in pochi minuti. */
export const limitePnr = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppe richieste da questo indirizzo — riprova tra qualche minuto.' },
});
