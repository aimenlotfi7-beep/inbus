# Cosa manca ancora

Aggiornato dopo una revisione completa del codice — la versione
precedente di questo documento era gravemente indietro: descriveva come
"da fare" cose già costruite e in produzione da tempo (Cestino,
Calendario, Vetrina, account cliente, portale Promoter, form Tour
Leader, upload file reale). Quello che segue è stato verificato contro
il codice vero, non a memoria.

## Gap reali rimasti

- **Pagamenti veri**: il checkout salva la prenotazione ma non addebita
  nessuna carta — serve integrare Stripe (o un altro gateway). Ricerca
  nel codice: nessun riferimento a Stripe/gateway di pagamento trovato
  in `packages/backend/src`.
- **Test automatici**: nessuno scritto (nessun file `.test.ts`/`.spec.ts`
  nel progetto) — solo verifica di compilazione TypeScript prima di ogni
  consegna, niente test end-to-end o unitari veri.
- **CI/CD**: nessuna pipeline automatica (niente `.github/workflows`) —
  ogni pubblicazione richiede ancora il flusso manuale descritto in
  `DEPLOY-PRODUZIONE.md` (copia file, commit, migrazione via tunnel,
  push, promozione manuale su Vercel).

## Cose già costruite (per chiarezza, visto che il documento precedente diceva il contrario)

Autenticazione cliente reale (email+password, verifica via link),
upload file reale su Cloudflare R2 (non solo un campo URL), Cestino con
recupero (eliminazione soft, mai definitiva), Calendario, Vetrina,
portale Promoter e Organizzatori con login proprio, form pubblico
candidatura Tour Leader, area scansione biglietti da bus, White Label
(widget incorporabile su siti terzi), sistema completo di rilevamento
variazioni post-vendita con comunicazione automatica ai clienti.

## Suggerimento

Prima di aggiungere qualunque voce a questo documento in futuro,
verificarla contro il codice (grep, non memoria) — è esattamente il
motivo per cui la versione precedente era diventata fuorviante.
