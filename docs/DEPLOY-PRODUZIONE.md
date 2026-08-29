# Come pubblicare INBUS online (Railway + Vercel)

Guida passo-passo per portare il progetto da "solo sul mio PC" a un
indirizzo internet vero, raggiungibile da chiunque. Percorso pensato per
essere il più semplice possibile, senza dover configurare server a mano.

**Cosa otterrai alla fine:**
- Un database Postgres vero, sempre acceso, gestito da Railway
- Il backend (le API) sempre acceso, gestito da Railway
- Il sito + gestionale pubblicati su Vercel, con un indirizzo tipo
  `https://tuo-progetto.vercel.app`

**Costo indicativo per iniziare:** gratuito o pochi euro al mese finché
il traffico è basso (entrambi i servizi hanno piani gratuiti generosi
per progetti piccoli/di test).

---

## Prerequisito: mettere il codice su GitHub

Railway e Vercel si collegano a un repository GitHub e pubblicano da lì
automaticamente ogni volta che aggiorni il codice. Se non hai già un
account GitHub:

1. Crea un account gratuito su [github.com](https://github.com)
2. Crea un nuovo repository (pulsante verde "New"), chiamalo ad esempio
   `inbus`, lascialo **privato** se preferisci
3. Nel tuo PC, dentro la cartella `inbus-v2`, esegui (nel terminale):
   ```powershell
   git init
   git add .
   git commit -m "Prima versione"
   git branch -M main
   git remote add origin https://github.com/TUO-UTENTE/inbus.git
   git push -u origin main
   ```
   (Se non hai mai usato Git, GitHub Desktop — [desktop.github.com](https://desktop.github.com/) —
   fa la stessa cosa con un'interfaccia grafica, senza terminale.)

Il file `.gitignore` incluso nel progetto evita già di caricare
`node_modules` e i file `.env` con le password — non serve preoccuparsene.

---

## Parte 1 — Il database e il backend su Railway

### 1.1 Crea il progetto

1. Vai su [railway.app](https://railway.app) e accedi con GitHub
2. "New Project" → "Deploy from GitHub repo" → scegli il repository `inbus`
3. Railway prova a indovinare cosa avviare: **cancella** questo primo
   servizio automatico per ora (lo rifacciamo bene al punto 1.3) — clicca
   sul servizio creato → Settings → Delete Service

### 1.2 Aggiungi il database Postgres

1. Nel progetto Railway, clicca "+ New" → "Database" → "Add PostgreSQL"
2. Fatto: Railway crea il database da solo e genera automaticamente una
   variabile `DATABASE_URL` che useremo tra poco

### 1.3 Aggiungi il backend come servizio

1. "+ New" → "GitHub Repo" → scegli di nuovo `inbus`
2. Railway crea un nuovo servizio. Aprilo e vai su **Settings**:
   - **Root Directory**: scrivi `packages/backend`
     (fondamentale: dice a Railway che il codice del backend sta lì
     dentro, non nella cartella principale del repository)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
3. Vai su **Variables** e aggiungi queste variabili d'ambiente:

   | Nome | Valore |
   |---|---|
   | `DATABASE_URL` | Clicca "Add Reference" e scegli quella del database Postgres creato al punto 1.2 (si collega da sola) |
   | `JWT_SECRET` | Una stringa lunga e casuale, es. genera qui: [1password.com/password-generator](https://1password.com/password-generator/) (almeno 32 caratteri) |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | Per ora mettici un valore provvisorio come `https://placeholder.vercel.app` — lo aggiorneremo al punto 3.1 col vero indirizzo del sito |
   | `ACCONTO_FISSO_EUR` | `10` |
   | `GIORNI_SCADENZA_SALDO` | `15` |

4. Railway pubblica automaticamente. Aspetta che il pallino diventi verde
   ("Deployed"/"Active")
5. Vai su **Settings → Networking → Generate Domain**: Railway ti dà un
   indirizzo pubblico tipo `https://inbus-backend-production.up.railway.app`
   — **copialo, ti servirà tra poco per il frontend**

### 1.4 Prepara il database (una tantum)

Dalla scheda del servizio backend su Railway, apri il tab **"Shell"** (o
usa la Railway CLI se preferisci il tuo terminale) ed esegui:
```
npm run db:migrate
npm run seed
```
Questo crea le tabelle e l'amministratore di prova (`admin@inbus.it` /
`inbus2026` — **cambia questa password reale prima di usarlo con dati
veri**, vedi la sezione "Sicurezza" più sotto).

---

## Parte 2 — Il sito e il gestionale su Vercel

1. Vai su [vercel.com](https://vercel.com) e accedi con GitHub
2. "Add New..." → "Project" → scegli il repository `inbus`
3. Nella schermata di configurazione:
   - **Root Directory**: clicca "Edit" e scegli `packages/frontend`
   - **Framework Preset**: Vercel dovrebbe riconoscere "Vite" da solo
   - **Build Command**: lascia quello di default (`npm run build`)
   - **Output Directory**: lascia quello di default (`dist`)
4. Apri "Environment Variables" e aggiungi:

   | Nome | Valore |
   |---|---|
   | `VITE_API_URL` | L'indirizzo del backend Railway copiato al punto 1.3.5, es. `https://inbus-backend-production.up.railway.app` |

5. Clicca "Deploy". Dopo 1-2 minuti Vercel ti dà l'indirizzo pubblico,
   tipo `https://inbus.vercel.app`

---

## Parte 3 — Collega backend e frontend

### 3.1 Aggiorna CORS sul backend

Torna su Railway, servizio backend → Variables → modifica `CORS_ORIGIN`
mettendo l'indirizzo vero che Vercel ti ha appena dato (es.
`https://inbus.vercel.app`, **senza slash finale**). Railway ripubblica
da solo dopo la modifica.

### 3.2 Prova tutto

Apri `https://inbus.vercel.app` (il sito) e `https://inbus.vercel.app/admin.html`
(il gestionale): dovresti vedere gli eventi caricarsi davvero dal database
su Railway, e riuscire a fare login nel gestionale.

Se il sito si apre ma non carica gli eventi, apri la Console del browser
(F12) e guarda se ci sono errori CORS o di connessione — quasi sempre
significa che `CORS_ORIGIN` o `VITE_API_URL` hanno un indirizzo sbagliato
(controlla che non ci siano slash finali `/` in più).

---

## Sicurezza prima di usarlo con dati veri

- **Cambia subito** la password dell'amministratore di prova
  (`admin@inbus.it` / `inbus2026`) — è pubblica in questa guida, chiunque
  la conosce
- Genera un `JWT_SECRET` vero e casuale (non lasciarlo mai vuoto o banale)
- Il checkout oggi **non addebita soldi veri** — prima di vendere
  biglietti reali serve integrare un gateway di pagamento (Stripe è il
  più comune), altrimenti stai solo raccogliendo prenotazioni "sulla
  fiducia"
- Attiva i backup automatici del database su Railway (Settings del
  database → Backups) prima di avere dati reali di clienti

## Da qui in avanti: come pubblichi un aggiornamento

Ogni volta che modifichi il codice sul tuo PC:
```powershell
git add .
git commit -m "Descrizione della modifica"
git push
```
Railway ripubblica il backend da solo appena vede il nuovo codice su
GitHub (1-2 minuti). **Vercel invece no** — crea una nuova build pronta,
ma resta ferma finché non la promuovi tu a mano: Deployments → tre
puntini sulla riga più recente → "Promote to Production". Se ti scordi
questo passaggio, il sito pubblico continua a mostrare la versione
precedente anche se GitHub ha già il codice nuovo.

---

## Flusso di lavoro incrementale (dopo il primo setup)

Una volta che il progetto è online, il lavoro di tutti i giorni non
riparte mai da zero — si applicano piccole modifiche, una alla volta.
Il flusso concreto usato per questo progetto:

1. **Ricevi un pacchetto zip** con solo i file davvero cambiati (mai
   tutto il progetto) — estrailo e copia il contenuto nella cartella
   giusta sovrascrivendo i file esistenti
2. **Verifica** con `git status --short` che i file segnati come
   modificati/nuovi siano esattamente quelli attesi, nel posto giusto
   (occhio a percorsi tipo `packages/backend/packages/...`: capita se
   il comando di copia viene lanciato dalla cartella sbagliata — vedi
   sotto)
3. **Se la modifica tocca lo schema del database** (nuove tabelle o
   colonne — riconoscibile da un file `.sql` dentro
   `packages/backend/drizzle/`), serve applicare la migrazione **prima**
   di pubblicare:
   ```powershell
   railway connect Postgres --tunnel-only
   ```
   (in una finestra a parte, tienila aperta) — poi, nell'altra finestra,
   dentro `packages/backend`:
   ```powershell
   "DATABASE_URL=postgresql://postgres:PASSWORD@127.0.0.1:PORTA/railway" | Out-File -Encoding utf8 .env
   Add-Content .env "JWT_SECRET=chiave-temporanea-solo-per-migrazioni"
   npm run db:migrate
   ```
   (`PORTA` è quella che il tunnel stampa a schermo) — poi **ripristina**
   `.env` con i valori di sviluppo locale, e chiudi il tunnel
4. **Commit e push**:
   ```powershell
   git add packages/
   git commit -m "Descrizione della modifica"
   git push
   ```
   (usa `git add packages/` invece di `git add .`/`git add -A` se nel
   progetto convivono cartelle di backup locali non tracciate — evita
   di caricarle per sbaglio)
5. **Promuovi su Vercel** (vedi sopra — non è automatico)

### Errore comune: percorso sbagliato durante la copia

Se il comando di copia dei file viene eseguito mentre ci si trova
dentro `packages\backend` invece che nella cartella principale del
progetto, i file finiscono annidati in un percorso sbagliato tipo
`packages/backend/packages/frontend/...` invece che
`packages/frontend/...` — `git status --short` lo rivela subito (righe
con percorsi ripetuti/strani). Prima di copiare, verifica sempre con
`Get-Location` di essere nella cartella principale del progetto.

---

## Nota tecnica: routing lato client

Il sito pubblico usa React Router (le pagine `/account`, `/faq`, `/pagina/...`,
`/promoter`, `/tour-leader` non sono file HTML separati, ma "viste" gestite
dal browser). Il file `packages/frontend/vercel.json` è già incluso e dice
a Vercel di far gestire tutti questi indirizzi al file `index.html`
(tranne `admin.html`, che resta separato) — non serve configurare nulla,
funziona già così pubblicando su Vercel.
