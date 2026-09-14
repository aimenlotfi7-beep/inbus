# OnWay (INBUS v2)

Piattaforma di prenotazione di bus per concerti ed eventi in Italia: sito pubblico,
area clienti, portali per promoter, organizzatori, tour leader e fornitori, e un
gestionale per chi organizza i viaggi.

- **Sito e gestionale** (React + Vite) pubblicati su **Vercel**
- **API** (Node.js + Express + TypeScript) e **database PostgreSQL** su **Railway**
- Codice su GitHub: a ogni caricamento partono controlli e test automatici

Aggiornato a settembre 2026.

---

## Cosa c'è dentro

### Sito pubblico e aree riservate
- **Home, pagina evento, carrello e checkout** (anche senza account: acquisto
  come ospite), **bundle** (`/bundle`), **tour** (`/tour/:slug`), **offerte**
  (`/offerta/:slug`), FAQ e pagine legali (`/pagina/:chiave`)
- **Area cliente** (`/account`): viaggi, biglietti, saldo, chat, credito
  fedeltà, invita un amico, privacy
- **Promoter** (`/promoter`, link `/p/:codice`) e **Organizzatori**
  (`/organizzatore`): statistiche e commissioni
- **Tour leader** (`/tour-leader` per candidarsi, `/scansione` per la lista
  passeggeri e la scansione dei biglietti sul bus)
- **Fornitori di bus**: registrazione (`/fornitore/registrati`) e risposta a
  quotazioni e preventivi dal link ricevuto via email
  (`/fornitore/preventivo/:token`)
- **Widget White Label** (`/w/:publicWidgetId`) da incorporare sui siti di terzi
- Link diretti: saldo (`/completa-saldo/:pnr`), lista d'attesa
  (`/finalizza/:token`), risposta a una variazione di viaggio (`/variazione/:token`)

### Gestionale (`/admin.html`)
41 voci in 9 gruppi, ognuna visibile solo a chi ha il permesso:

| Gruppo | Voci |
|---|---|
| Eventi | Eventi, Bundle, Tour, Calendario |
| Partenze | Orari, Quotazione, Prezzi, Da confermare, Confermate, Passate, Variazioni |
| Vendite | Prenotazioni, Lista d'attesa |
| Marketing | Campagne, Tracciamento, Coupon, Offerte, Vetrina, Contenuti sito, Testo email, Layout biglietto |
| Customer Care | Pagamenti, Rimborsi, Utenti, Voucher, Chat, Comunicazioni |
| Persone | Promoter, Organizzatori, White Label, Tour Leader |
| Logistica | Fornitori, Fermate, Tragitti salvati |
| Sistema | Amministratori, Ruoli, Cestino, Statistiche, Testi tooltip, Impostazioni |
| Beta | Tragitti vicini |

### Il percorso di un viaggio (Partenze)
1. **Orari** — si calcolano gli orari delle fermate a partire dall'arrivo.
2. **Quotazione** — ai fornitori si chiede un prezzo *indicativo* di un bus sul
   tragitto. La richiesta **parte da sola** appena ci sono gli orari, ai fornitori
   con "Invio automatico" nel raggio. Scegliere una quotazione non impegna nessuno.
3. **Prezzi** — dal costo della quotazione si calcola il prezzo di ogni fermata e
   il tragitto va in vendita. Le vendite non si fermano mai per i posti dei bus.
4. **Da confermare** — quando le prenotazioni arrivano al pareggio nasce la
   proposta di un bus e i **preventivi per quel bus partono da soli** (con la
   precedenza a chi ha dato la quotazione). Si sceglie il fornitore e si conferma:
   ogni bus può avere un fornitore diverso.
5. **Confermate / Passate** — bus assegnati, smistamento automatico dei passeggeri
   per età il giorno prima della partenza, biglietto con il bus solo a saldo pagato.

Colori uguali ovunque in Partenze: **rosso** tocca a noi, **arancio** si aspetta
qualcun altro, **verde** fatto, **viola** percorso cambiato dopo la quotazione.

### Regole sui soldi (decise dal proprietario)
- Acconto **per passeggero**, mai oltre il totale; il saldo scade 15 giorni prima
  dell'evento e dopo quella data l'acconto non si può più scegliere.
- Un coupon vale **una volta per ordine**.
- Credito fedeltà e bonus "invita un amico" solo a pagamento confermato.
- Nessun gateway di pagamento collegato per ora: gli ordini dal sito risultano
  "da concordare".

### Numeri
- Backend: 39 moduli, 58 tabelle, 91 migrazioni del database
- Test automatici: 122 veloci e 96 con il database (backend), 22 nel gestionale

---

## Far girare tutto sul proprio computer

### Modo semplice: doppio clic
Serve avere installato **Node.js** (versione LTS) e **Docker Desktop**, aperto e
pronto (icona della balena ferma).

1. **`INSTALLA.bat`** — una sola volta: dipendenze, database, dati di esempio.
2. **`AVVIA.bat`** — ogni volta: database, API e sito. Poi apri
   `http://localhost:5173` (sito) e `http://localhost:5173/admin.html` (gestionale).
3. **`STOP.bat`** — spegne tutto.
4. **`STUDIO.bat`** — apre Drizzle Studio per guardare i dati del database.

Accesso al gestionale in locale, con i dati di esempio: `admin@inbus.it` / `inbus2026`
(solo sul proprio computer, mai in produzione).

### Modo manuale (terminale)
```bash
docker compose up -d                # database Postgres locale
cd packages/backend
npm install
cp .env.example .env                # DATABASE_URL e JWT_SECRET
npm run db:migrate
npm run seed
npm run dev                         # API su http://localhost:4000
```
In un secondo terminale:
```bash
cd packages/frontend
npm install
npm run dev                         # sito e gestionale su http://localhost:5173
```

> **Attenzione ai database.** `packages/backend/.env` punta al database locale.
> Il `.env` nella radice del repository punta alla **produzione**: i comandi del
> backend e gli script in `src/db/` vanno lanciati **sempre da `packages/backend`**.
> `db:azzera-tutto-test` cancella eventi, prenotazioni e clienti: mai senza motivo.

### Problemi comuni
- **"npm: comando non trovato"** — Node.js non installato, o terminale da riaprire.
- **"Cannot connect to the Docker daemon"** — Docker Desktop non è avviato.
- **Errore su `DATABASE_URL`** — manca `packages/backend/.env` (copia `.env.example`).
- **"port 5432 already in use"** — un altro Postgres usa la porta: fermalo o
  cambia la porta in `docker-compose.yml` e in `.env`.
- **Il sito non mostra eventi** — l'API non è partita o manca `npm run seed`.

---

## Test e controlli automatici

| Comando (da `packages/backend`) | Cosa prova |
|---|---|
| `npm test` | Regole pure: prezzi, date e ore di Roma, orari di partenza, proposte da confermare, statistiche |
| `npm run test:db` | Con un database vero: prenotazioni, acconto, saldo, coupon, rimborsi, smistamento, accessi, quotazioni e preventivi per bus, invio automatico ai fornitori |

`npm run test:db` usa **solo** un database che finisce con `_test` e sta su questo
computer (di solito `inbus_test` in Docker, creato da solo) e non manda email vere.

Da `packages/frontend`: `npm test` (regola dei colori e dei pallini di Partenze).

Su GitHub, a ogni caricamento (`.github/workflows/ci.yml`): controllo dei tipi,
tutti i test (anche con un database creato per il giro) e build del sito. Se
qualcosa fallisce arriva una mail. `smoke.yml` controlla ogni 30 minuti che il
sito in produzione risponda.

---

## Struttura del repository

```
inbus-v2/
├── docker-compose.yml                 # Postgres locale
├── INSTALLA.bat / AVVIA.bat / STOP.bat / STUDIO.bat
├── .github/workflows/                 # controlli automatici
├── docs/                              # guida alla pubblicazione (DEPLOY-PRODUZIONE.md)
└── packages/
    ├── backend/
    │   ├── drizzle/                   # migrazioni SQL (applicate da sole all'avvio su Railway)
    │   ├── test/                      # dati finti e controlli di sicurezza per i test con il database
    │   └── src/
    │       ├── db/schema.ts           # tutte le tabelle
    │       ├── modules/               # un modulo per argomento (routes + service)
    │       ├── shared/                # email, date, errori, scheduler, registro attività
    │       └── config/env.ts          # variabili d'ambiente controllate all'avvio
    └── frontend/
        └── src/
            ├── api/                   # chiamate all'API, una per modulo
            ├── pages/                 # pagine del sito pubblico e delle aree riservate
            ├── features/              # parti del sito: evento, carrello, checkout, bundle, white label
            ├── shared/                # componenti comuni del sito
            ├── admin/                 # gestionale: shared/ (componenti comuni), screens/ (una schermata per voce)
            └── styles/                # sito.css, gestionale.css, onway-theme.css e un foglio per area
```

## Perché questa architettura
- **PostgreSQL** — eventi, tragitti, fermate, bus e prenotazioni sono dati legati tra loro.
- **Node.js + TypeScript + Express** — tecnologie diffuse, facili da trovare.
- **Drizzle ORM** — TypeScript e SQL puro, migrazioni versionate nel repository.
- **React + TypeScript + Vite** — ogni schermata è un file a sé.
- **Moduli per argomento** — chi impara come è fatto un modulo sa leggere anche gli altri.

## Pubblicazione
- Frontend: Vercel, pubblica da solo a ogni caricamento su `main`.
- Backend: Railway, pubblica da solo; all'avvio applica le migrazioni del database
  (`node dist/db/migrate.js`) e poi avvia il server.
- Guida passo passo: `docs/DEPLOY-PRODUZIONE.md`.
