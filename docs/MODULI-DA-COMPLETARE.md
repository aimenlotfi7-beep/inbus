# Cosa manca ancora

Backend (13 moduli) e gestionale (11 sezioni) sono completi e collegati
ai dati veri. Quello che resta riguarda soprattutto il **sito pubblico**
lato cliente e alcune rifiniture.

## Sito pubblico — area cliente mancante

- **Login/account cliente** ("My INBUS", I miei viaggi, Chat) — oggi il
  sito ha solo lista eventi + checkout, senza area riservata dopo l'acquisto
- **Pagine FAQ/Privacy/Cookie** — l'API `/api/pagine` esiste ed è
  collegata al gestionale (sezione "Contenuti sito"), manca solo la
  pagina pubblica che le mostra al cliente
- **Portale Promoter** — l'API di login esiste (`POST /api/promoter/login`),
  manca la pagina pubblica
- **Form pubblico Tour Leader** — l'API esiste (`POST /api/tour-leader/candidatura`),
  manca il form pubblico (oggi le candidature vanno inserite/gestite
  solo dal gestionale)

## Gestionale — rifiniture possibili

- **Vetrina**: oggi il toggle "in evidenza" si imposta dentro il form
  evento; se vuoi una schermata dedicata con drag&drop per l'ordine,
  va costruita usando lo stesso `PUT /api/eventi/:id`, nessuna nuova API
- **Calendario**: vista mensile — richiede solo raggruppamento lato
  frontend dei dati già restituiti da `GET /api/eventi`, nessuna nuova API
- **Cestino**: oggi la cancellazione evento è definitiva
  (`DELETE /api/eventi/:id`); per un vero cestino, aggiungere un campo
  `eliminatoIl` allo schema invece di cancellare la riga
- **Transazioni/Pagamenti come tabella dedicata**: oggi le prenotazioni
  si vedono solo tramite `by-email`/`by-pnr`; serve aggiungere un
  endpoint `GET /api/prenotazioni` con filtri e paginazione per una
  vista tabellare completa nel gestionale
- **Wizard a step per la creazione evento**: oggi il form Eventi è un
  unico modale; se vuoi lo stesso wizard multi-step del prototipo
  originale, è una questione di UI (React `useState` per lo step
  corrente), l'API sotto è già pronta così com'è

## Cose infrastrutturali prima della produzione vera

- **Test automatici** (nessuno scritto — solo verifica di compilazione)
- **CI/CD** per pubblicare automaticamente ad ogni modifica
- **Autenticazione cliente reale** (oggi il sito non verifica l'identità
  di chi prenota via email, serve un vero magic-link o OTP)
- **Pagamenti veri**: il checkout salva la prenotazione ma non addebita
  nessuna carta — serve integrare Stripe o un altro gateway
- **Storage file vero** per immagini/allegati (oggi il campo `url` si
  aspetta un link già esistente, non gestisce l'upload di file)
- **Deploy**: il progetto gira solo in locale finora; per metterlo online
  servono un hosting per backend+Postgres (es. Railway, Render, Fly.io)
  e uno per il frontend statico (es. Vercel, Netlify)
