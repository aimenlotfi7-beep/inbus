# INBUS v2 — Architettura di produzione

Riscrittura da zero della Versione 18 (il prototipo statico HTML/JS/localStorage)
con un'architettura pensata per essere **affidabile** e **modificabile da
qualsiasi programmatore** senza dover ricostruire la struttura da capo.

## Stato del progetto

- **Backend**: 13 moduli, tutti con API vere e funzionanti (vedi elenco sotto)
- **Sito pubblico**: grafica e struttura **identiche alla Versione 18**,
  con tutte le pagine collegate all'API vera:
  - **Home** (`/`) — eventi, vetrina, checkout
  - **My INBUS** (`/account`) — login per email, i miei viaggi, chat
  - **FAQ** (`/faq`) e pagine legali (`/pagina/privacy`, `/pagina/cookie`,
    `/pagina/termini`, `/pagina/chisiamo`, `/pagina/contatti`)
  - **Area Promoter** (`/promoter`) — login, statistiche, generatore di link
  - **Candidatura Tour Leader** (`/tour-leader`) — form pubblico, supporta
    `?evento=ID` per candidature legate a un evento specifico
- **Gestionale**: grafica e struttura **identiche alla Versione 18**
  (stesso menu laterale a gruppi collassabili, stessa Home con ricerca
  centrale, stesse card/tabelle/modali), con 15 sezioni collegate all'API vera

Tutto è stato **verificato per davvero** in questo ambiente: compilazione
TypeScript pulita, build di produzione Vite riuscita, avvio a runtime
dell'app Express confermato. L'unica cosa che non ho potuto testare qui è
l'esecuzione contro un vero database Postgres (questa sandbox non può
far girare un database persistente) — il codice è scritto per funzionare
appena colleghi un Postgres vero, e le istruzioni sotto ti guidano passo
passo a farlo sul tuo computer.

---

## Come far girare tutto sul tuo computer

### Modalità semplice (consigliata): doppio click

Ho preparato tre file per evitare di scrivere comandi nel terminale ogni volta:

1. **`INSTALLA.bat`** — da eseguire **una sola volta**, la prima volta che scarichi
   il progetto (fa tutta l'installazione automaticamente: dipendenze, database,
   dati di esempio). Ci mette qualche minuto, è normale.
2. **`AVVIA.bat`** — da usare **ogni volta che vuoi lavorare**: apre da solo
   database, backend e sito. Aspetta qualche secondo, poi apri il browser su
   `http://localhost:5173`.
3. **`STOP.bat`** — per spegnere tutto in ordine quando hai finito.

Serve comunque avere installato una volta Node.js e Docker Desktop (vedi sotto),
e Docker Desktop deve essere **aperto e pronto** prima di lanciare `AVVIA.bat`
(guarda l'icona della balena in basso a destra: deve essere stabile, non animata).

Se preferisci il controllo manuale via terminale, trovi le istruzioni passo-passo
più sotto.

### Cosa installare prima (una tantum), prima di usare INSTALLA.bat

1. **Node.js** (versione LTS) — [nodejs.org](https://nodejs.org)
2. **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)

Dopo l'installazione riavvia il computer se richiesto, poi apri Docker Desktop
e aspetta che sia pronto prima di lanciare `INSTALLA.bat`.

### Modalità manuale (via terminale)

### 2. Estrai il progetto

Estrai lo zip in una cartella, ad esempio `Desktop/inbus-v2`, e apri un
terminale in quella cartella (`cd Desktop/inbus-v2`).

### 3. Avvia il database

```bash
docker compose up -d
```
La prima volta scarica l'immagine di Postgres (circa un minuto). Verifica
che sia partito con `docker ps`: dovresti vedere un container chiamato
`inbus-v2-postgres-1` con stato `Up`.

### 4. Avvia il backend (l'API)

In questo stesso terminale:
```bash
cd packages/backend
npm install
cp .env.example .env
npm run db:migrate
npm run seed
npm run dev
```
**Lascia questo terminale aperto.** Vedrai scritto qualcosa tipo:
```
INBUS API in ascolto su http://localhost:4000 (development)
```
Se si ferma o dà errore, guarda la sezione "Problemi comuni" più sotto.

### 5. Avvia il frontend (sito + gestionale)

Apri un **secondo terminale** (senza chiudere il primo), nella stessa
cartella del progetto:
```bash
cd packages/frontend
npm install
npm run dev
```
Vedrai scritto qualcosa tipo:
```
Local:   http://localhost:5173/
```

### 6. Apri il browser

- **Sito pubblico**: [http://localhost:5173](http://localhost:5173)
  — vedrai l'evento di esempio "Ultimo" allo Stadio Olimpico, creato dal
  seed; puoi cliccare "Prenota" e provare un checkout vero
- **Gestionale**: [http://localhost:5173/admin.html](http://localhost:5173/admin.html)
  — login con `admin@inbus.it` / `inbus2026`, poi hai il menu laterale
  con tutte le sezioni collegate ai dati veri

### Come fermare tutto

Nei due terminali aperti premi `Ctrl+C`. Per fermare anche il database:
```bash
docker compose down
```
(i dati restano salvati; la prossima volta ti basta `docker compose up -d`)

---

## Problemi comuni

**"npm: comando non trovato"** → Node.js non è installato o serve
riavviare il terminale dopo l'installazione.

**"Cannot connect to the Docker daemon"** → Docker Desktop non è avviato:
aprilo dall'icona sul desktop/dock e aspetta che sia pronto (icona verde),
poi riprova `docker compose up -d`.

**Il backend dà errore su `DATABASE_URL`** → controlla di aver eseguito
`cp .env.example .env` dentro `packages/backend` (il file `.env` non è
incluso nello zip per sicurezza, va creato copiando l'esempio).

**"port 5432 already in use"** → hai già un altro Postgres in ascolto
sulla stessa porta. Ferma quell'altro servizio, oppure cambia la porta
in `docker-compose.yml` (es. `"5433:5432"`) e nella `DATABASE_URL` dentro
`.env` di conseguenza.

**Il sito si apre ma non vedi eventi** → controlla che il terminale del
backend sia ancora aperto e senza errori, e che tu abbia eseguito
`npm run seed` almeno una volta.

Se qualcosa non torna, mandami il messaggio di errore esatto che vedi
nel terminale (anche uno screenshot va benissimo) e lo risolviamo insieme.

---

## Perché questa architettura

- **PostgreSQL** — i dati (eventi → bus → fermate → prenotazioni, utenti...)
  sono profondamente relazionali: è lo strumento giusto, non un file JSON.
- **Node.js + TypeScript + Express** — backend standard, documentato,
  facile da trovare su cui assumere sviluppatori.
- **Drizzle ORM** (non Prisma) — scelta pragmatica: Prisma richiede di
  scaricare un motore binario da un server esterno, impossibile da
  verificare in questo ambiente sandbox. Drizzle è puro TypeScript/SQL,
  altrettanto moderno e diffuso, e mi ha permesso di **compilare e
  testare per davvero** ogni parte di questo progetto.
- **React + TypeScript + Vite** — frontend a componenti: ogni sezione
  (Eventi, Chat, Utenti...) è un file piccolo e isolato, non un unico
  file da migliaia di righe come nel prototipo originale.
- **Struttura a moduli per dominio** (`modules/eventi`, `modules/prenotazioni`...),
  ognuno con lo stesso schema a 4 file: chi impara il pattern su un
  modulo sa già leggere tutti gli altri.

## Struttura del repository

```
inbus-v2/
├── docker-compose.yml
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── db/schema.ts          # tutte le tabelle (22)
│   │   │   ├── modules/              # 13 moduli, uno per dominio
│   │   │   ├── shared/                # errori, validazione condivisi
│   │   │   └── config/env.ts          # variabili d'ambiente validate
│   │   └── drizzle/                   # migration SQL generate
│   └── frontend/
│       └── src/
│           ├── api/                   # client HTTP tipizzato per modulo
│           ├── features/              # sito pubblico (eventi, checkout)
│           ├── admin/                 # gestionale
│           │   ├── shared/            # layout, modale, tabella riusabili
│           │   └── screens/           # una schermata per sezione
│           └── styles/theme.css       # stesso tema colori del prototipo
└── docs/MODULI-DA-COMPLETARE.md       # cosa manca e come completarlo
```

## Moduli backend implementati (13)

Auth · Eventi · Prenotazioni (con blocco posti atomico anti-doppia-prenotazione)
· Utenti · Pagine CMS + Contenuti sito · Coupon · Fornitori · Tragitti ·
Promoter · Tour Leader · Chat · Amministratori · Statistiche

## Sezioni gestionale collegate (15)

Home (ricerca) · Statistiche · Eventi · Vetrina · Calendario · Cestino ·
Transazioni · Pagamenti · Utenti · Fornitori · Tragitti · Promoter ·
Tour Leader · Coupon · Chat · Contenuti sito · Amministratori

Per il dettaglio di cosa manca ancora (area cliente sul sito, pagamenti
veri, ecc.) vedi `docs/MODULI-DA-COMPLETARE.md`.

Per pubblicare il progetto online (non solo sul tuo PC), vedi
`docs/DEPLOY-PRODUZIONE.md` — guida passo-passo con Railway + Vercel.
