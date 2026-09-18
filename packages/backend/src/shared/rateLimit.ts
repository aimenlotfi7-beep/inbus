import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

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
 *
 * L'indirizzo è quello vero del visitatore solo perché app.ts dice a
 * Express di fidarsi del proxy di Railway ("trust proxy"): senza, tutti
 * i visitatori sembravano arrivare dallo stesso indirizzo e i limiti
 * valevano per tutti INSIEME (l'undicesimo accesso del quarto d'ora,
 * di chiunque, veniva rifiutato).
 */

const base = { standardHeaders: true, legacyHeaders: false } as const;

function ip(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

/** Stesso indirizzo E stessa email: chi prova tante password su UN
 *  account si ferma presto, ma persone diverse dietro lo stesso
 *  indirizzo (ufficio, rete del telefono) non si bloccano a vicenda. */
function ipEdEmail(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${ip(req)}|${email}`;
}

const troppiTentativi = { errore: 'Troppi tentativi da questo indirizzo — riprova tra qualche minuto.' };

/** Login e reset password — tentativi ripetuti in poco tempo sono quasi
 *  sempre un attacco, non un utente vero che sbaglia la password 10
 *  volte in un minuto. Due freni insieme: 10 tentativi per account e
 *  indirizzo, 50 in tutto per indirizzo (chi prova tanti account
 *  diversi dallo stesso posto). */
export const limiteAutenticazione = [
  rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 50, keyGenerator: ip, message: troppiTentativi }),
  rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: ipEdEmail, message: troppiTentativi }),
];

/** Registrazione nuovo account e iscrizione alla lista d'attesa — più
 *  permissivo del login (non è un tentativo "sbagliato"), ma comunque
 *  limitato per evitare account o iscrizioni finte create in massa da
 *  uno script. */
export const limiteRegistrazione = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000, // 1 ora
  limit: 20,
  keyGenerator: ip,
  message: { errore: 'Troppe registrazioni da questo indirizzo — riprova più tardi.' },
});

/** Le route che cercano una prenotazione per PNR (GET /:pnr, saldo,
 *  ecc.) o aprono un link con un codice (variazioni, preventivi, lista
 *  d'attesa) non richiedono login — si affidano al codice stesso come
 *  unica "chiave". Anche con codici lunghi e imprevedibili, un limite
 *  qui resta una barriera in più contro chi provasse comunque a
 *  scriverne a raffica — un cliente vero non ha bisogno di aprire la
 *  stessa prenotazione centinaia di volte in pochi minuti. */
export const limitePnr = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: ip,
  message: { errore: 'Troppe richieste da questo indirizzo — riprova tra qualche minuto.' },
});

/** Verifica di un codice sconto, pubblica perché il checkout mostra lo
 *  sconto prima di accedere: senza un freno si potrebbero provare
 *  migliaia di codici finché uno funziona. */
export const limiteCoupon = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: ip,
  message: { errore: 'Troppi codici provati da questo indirizzo — riprova tra qualche minuto.' },
});
