<#
  carica-pagine-legali.ps1  (v2 - compatibile Windows PowerShell 5.1)
  Carica privacy, cookie policy e termini nel CMS di INBUS via API.

  USO
    .\carica-pagine-legali.ps1
    .\carica-pagine-legali.ps1 -ApiUrl "https://api.tuodominio.it"
    .\carica-pagine-legali.ps1 -Solo privacy
    .\carica-pagine-legali.ps1 -NoVerificaSegnaposto
#>

param(
  [string]   $ApiUrl   = "http://localhost:4000",
  [string]   $Cartella = ".",
  [string[]] $Solo,
  [switch]   $NoVerificaSegnaposto
)

$ErrorActionPreference = "Stop"

$pagine = @(
  @{ chiave = "privacy"; titolo = "Informativa sulla privacy"; file = "privacy-cms.html" }
  @{ chiave = "cookie";  titolo = "Cookie policy";             file = "cookie-cms.html"  }
  @{ chiave = "termini"; titolo = "Termini e Condizioni";      file = "termini-cms.html" }
)
if ($Solo) { $pagine = $pagine | Where-Object { $Solo -contains $_.chiave } }
if (-not $pagine) { throw "Nessuna pagina selezionata. Valori validi: privacy, cookie, termini." }

# --- 1. Lettura file e controllo segnaposto --------------------------------
$bloccato = $false
foreach ($p in $pagine) {
  $percorso = Join-Path $Cartella $p.file
  if (-not (Test-Path $percorso)) { throw "File non trovato: $percorso" }

  # Lettura forzata in UTF-8: la 5.1 altrimenti usa la codepage di sistema.
  $testo = [System.IO.File]::ReadAllText((Resolve-Path $percorso), [System.Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($testo)) { throw "Il file $($p.file) risulta vuoto." }
  $p.contenuto = $testo

  $trovati = [regex]::Matches($testo, '\[[A-Z0-9][^\]]{2,80}\]')
  $segnaposto = @($trovati | ForEach-Object { $_.Value } | Select-Object -Unique)
  if ($segnaposto.Count -gt 0) {
    Write-Host ""
    Write-Host "  $($p.file): $($segnaposto.Count) segnaposto da completare" -ForegroundColor Yellow
    foreach ($s in ($segnaposto | Select-Object -First 12)) {
      Write-Host "    $s" -ForegroundColor DarkYellow
    }
    if (-not $NoVerificaSegnaposto) { $bloccato = $true }
  }
}
if ($bloccato) {
  Write-Host ""
  Write-Host "Completa i campi elencati sopra prima di pubblicare." -ForegroundColor Yellow
  Write-Host "Per caricare comunque una bozza: .\carica-pagine-legali.ps1 -NoVerificaSegnaposto" -ForegroundColor DarkGray
  exit 1
}

# --- 2. Login --------------------------------------------------------------
Write-Host ""
Write-Host "Accesso a $ApiUrl" -ForegroundColor Cyan
$email    = Read-Host "Email amministratore"
$password = Read-Host "Password" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$passwordChiara = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

# TLS 1.2 non e' attivo per default nella 5.1: serve per le chiamate https.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
  $corpoLogin = @{ email = $email; password = $passwordChiara } | ConvertTo-Json
  $byteLogin  = [System.Text.Encoding]::UTF8.GetBytes($corpoLogin)
  $risposta = Invoke-RestMethod -Uri "$ApiUrl/api/auth/admin/login" -Method Post `
                -ContentType "application/json; charset=utf-8" -Body $byteLogin
  $token = $risposta.token
  if (-not $token) { throw "Login riuscito ma nessun token nella risposta." }
  Write-Host "Autenticato." -ForegroundColor Green
} catch {
  Write-Host "Login fallito: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor DarkRed }
  exit 1
} finally {
  $passwordChiara = $null
}

$intestazioni = @{ Authorization = "Bearer $token" }

# --- 3. Caricamento --------------------------------------------------------
foreach ($p in $pagine) {
  $kb = [math]::Round($p.contenuto.Length / 1024, 1)
  Write-Host ""
  Write-Host ("{0,-8} {1} KB" -f $p.chiave, $kb) -NoNewline

  $corpo = @{ titolo = $p.titolo; contenuto = $p.contenuto } | ConvertTo-Json -Depth 3 -Compress
  $byte  = [System.Text.Encoding]::UTF8.GetBytes($corpo)

  try {
    Invoke-RestMethod -Uri "$ApiUrl/api/pagine/$($p.chiave)" -Method Put `
      -Headers $intestazioni -ContentType "application/json; charset=utf-8" -Body $byte | Out-Null
    Write-Host "   salvata" -ForegroundColor Green
  } catch {
    Write-Host "   ERRORE" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor DarkRed }
  }
}

# --- 4. Rilettura di controllo ---------------------------------------------
Write-Host ""
Write-Host "Verifica dal lato pubblico dell'API:" -ForegroundColor Cyan
foreach ($p in $pagine) {
  try {
    $letta   = Invoke-RestMethod -Uri "$ApiUrl/api/pagine/$($p.chiave)" -Method Get
    $sezioni = [regex]::Matches($letta.contenuto, '<h2>').Count
    $uguale  = $letta.contenuto.Length -eq $p.contenuto.Length
    $colore  = if ($uguale) { "Green" } else { "Yellow" }
    Write-Host ("  {0,-8} {1,6} caratteri, {2} sezioni" -f $p.chiave, $letta.contenuto.Length, $sezioni) -ForegroundColor $colore
    if (-not $uguale) { Write-Host "    lunghezza diversa dal file locale: ricontrolla la pagina" -ForegroundColor Yellow }
  } catch {
    Write-Host "  $($p.chiave): rilettura fallita" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Fatto. Controlla le pagine sul sito:" -ForegroundColor Cyan
foreach ($p in $pagine) { Write-Host "  /pagina/$($p.chiave)" }
Write-Host ""
