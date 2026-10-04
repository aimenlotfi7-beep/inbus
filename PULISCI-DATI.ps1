# INBUS - Pulizia dei dati di prova prima del lancio.
#
# Cancella eventi, prenotazioni, ordini, crediti, clienti, coupon,
# campagne, bundle, tour, White Label, organizzatori, promoter, tour
# leader, spese fornitori e registro attivita'.
# NON tocca: fornitori, anagrafica Fermate, Percorsi salvati, le utenze
# del gestionale, i ruoli e tutte le impostazioni.
#
# Il lavoro vero lo fa packages\backend\src\db\azzera-dati-prelancio.ts,
# in un'unica operazione: se qualcosa va storto non cancella niente.
#
# Si lancia con un doppio clic su PULISCI-DATI.bat, oppure da PowerShell
# in questa cartella:  .\PULISCI-DATI.ps1

$ErrorActionPreference = 'Stop'
$cartella = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $cartella

function Titolo($testo) {
  Write-Host ''
  Write-Host '============================================' -ForegroundColor Cyan
  Write-Host "  $testo" -ForegroundColor Cyan
  Write-Host '============================================' -ForegroundColor Cyan
  Write-Host ''
}

function Esci($messaggio) {
  Write-Host ''
  Write-Host $messaggio -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Niente e'' stato cancellato.' -ForegroundColor Green
  exit 1
}

Titolo 'INBUS - Pulizia dei dati di prova'

# ---------------------------------------------------------------
# 1. A quale database ci colleghiamo
# ---------------------------------------------------------------
$indirizzo = ''
if (Test-Path '.env') {
  $riga = Select-String -Path '.env' -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
  if ($riga) {
    $indirizzo = ($riga.Line -replace '^\s*DATABASE_URL\s*=', '').Trim().Trim('"').Trim("'")
  }
}

function MostraIndirizzo($url) {
  return ($url -replace '://[^@]+@', '://***@')
}

function Raggiungibile($url) {
  try {
    $u = [uri]$url
    $porta = $u.Port
    if ($porta -le 0) { $porta = 5432 }
    $prova = Test-NetConnection -ComputerName $u.Host -Port $porta -WarningAction SilentlyContinue
    return $prova.TcpTestSucceeded
  } catch {
    return $false
  }
}

if ($indirizzo) {
  Write-Host ('Indirizzo trovato nel file .env: ' + (MostraIndirizzo $indirizzo))
  Write-Host 'Controllo se risponde...'
  if (-not (Raggiungibile $indirizzo)) {
    Write-Host 'Non risponde (il collegamento a Railway probabilmente non e'' aperto).' -ForegroundColor Yellow
    $indirizzo = ''
  } else {
    Write-Host 'Risponde.' -ForegroundColor Green
  }
} else {
  Write-Host 'Nessun indirizzo nel file .env.' -ForegroundColor Yellow
}

if (-not $indirizzo) {
  Write-Host ''
  Write-Host 'Prendi l''indirizzo del database da Railway:' -ForegroundColor Cyan
  Write-Host '  Railway -> servizio Postgres -> Variables -> DATABASE_PUBLIC_URL'
  Write-Host '  (inizia con postgresql://  e contiene la password: non si vedra'' mentre lo incolli)'
  Write-Host ''
  $segreto = Read-Host 'Incolla qui l''indirizzo e premi Invio (Invio vuoto per annullare)' -AsSecureString
  $indirizzo = [System.Net.NetworkCredential]::new('', $segreto).Password
  if (-not $indirizzo) { Esci 'Annullato: nessun indirizzo inserito.' }
  if (-not (Raggiungibile $indirizzo)) {
    Esci 'Quell''indirizzo non risponde. Controlla di averlo copiato tutto, poi riprova.'
  }
  Write-Host 'Risponde.' -ForegroundColor Green
}

$dove = 'PRODUZIONE (il sito online)'
if ($indirizzo -match 'localhost|127\.0\.0\.1') {
  # Un collegamento a Railway aperto sul computer usa 127.0.0.1 con una
  # porta alta; il database locale di prova usa invece la porta 5432.
  if ($indirizzo -match ':5432/') { $dove = 'DATABASE LOCALE DI PROVA (Docker), non la produzione' }
}

# ---------------------------------------------------------------
# 2. Conferma
# ---------------------------------------------------------------
Titolo 'Sto per cancellare i dati'
Write-Host "Database:  $dove"
Write-Host ('Indirizzo: ' + (MostraIndirizzo $indirizzo))
Write-Host ''
Write-Host 'VANNO VIA:' -ForegroundColor Yellow
Write-Host '  - eventi (con tragitti, fermate degli eventi, linee, bus, servizi,'
Write-Host '    lista d''attesa, chat, comunicazioni, variazioni, preventivi, offerte)'
Write-Host '  - prenotazioni, ordini, movimenti di credito, account cliente'
Write-Host '  - coupon e voucher, campagne'
Write-Host '  - bundle, tour, White Label'
Write-Host '  - organizzatori, promoter, tour leader'
Write-Host '  - spese e pagamenti fornitori, registro attivita'''
Write-Host ''
Write-Host 'RESTANO:' -ForegroundColor Green
Write-Host '  - fornitori'
Write-Host '  - anagrafica Fermate'
Write-Host '  - percorsi salvati'
Write-Host '  - le tue utenze del gestionale, ruoli e permessi'
Write-Host '  - impostazioni, testi dei tooltip, modelli email, layout biglietto,'
Write-Host '    contenuti del sito, categorie'
Write-Host ''
Write-Host 'NON SI TORNA INDIETRO.' -ForegroundColor Red
Write-Host ''
$risposta = Read-Host 'Scrivi  CANCELLA  e premi Invio per procedere (qualsiasi altra cosa annulla)'
if ($risposta -ne 'CANCELLA') { Esci 'Annullato.' }

# ---------------------------------------------------------------
# 3. Via
# ---------------------------------------------------------------
Titolo 'Procedo'
$env:DATABASE_URL = $indirizzo
Set-Location (Join-Path $cartella 'packages\backend')

$tsx = Join-Path (Get-Location) 'node_modules\.bin\tsx.cmd'
if (Test-Path $tsx) {
  & $tsx 'src/db/azzera-dati-prelancio.ts' 'CONFERMO'
} else {
  Write-Host 'Uso npx (la prima volta puo'' metterci un minuto)...'
  & npx --yes tsx 'src/db/azzera-dati-prelancio.ts' 'CONFERMO'
}
$esito = $LASTEXITCODE
$env:DATABASE_URL = $null
Set-Location $cartella

Write-Host ''
if ($esito -eq 0) {
  Write-Host 'Pulizia completata.' -ForegroundColor Green
  Write-Host 'Apri il gestionale: gli eventi e i clienti sono vuoti, fornitori,'
  Write-Host 'fermate e percorsi salvati sono al loro posto.'
} else {
  Write-Host 'Qualcosa non e'' andato: NIENTE e'' stato cancellato (e'' tutto o niente).' -ForegroundColor Red
  Write-Host 'Copia il messaggio di errore qui sopra e mandalo a Claude.'
}
Write-Host ''
