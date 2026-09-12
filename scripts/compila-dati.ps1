<#
  compila-dati.ps1
  Sostituisce i dati anagrafici nei tre file legali di INBUS e poi elenca
  TUTTO quello che resta tra parentesi quadre, senza limiti di lunghezza.

  Crea una copia di sicurezza *-originale.html prima di toccare i file.

  USO
    .\compila-dati.ps1
    .\compila-dati.ps1 -SoloElenco     (non modifica nulla, mostra cosa manca)
#>

param(
  [string] $Cartella = ".",
  [switch] $SoloElenco
)

$ErrorActionPreference = "Stop"
$file = @("privacy-cms.html", "cookie-cms.html", "termini-cms.html")

foreach ($f in $file) {
  if (-not (Test-Path (Join-Path $Cartella $f))) { throw "File non trovato: $f" }
}

function Leggi([string]$percorso) {
  return [System.IO.File]::ReadAllText((Resolve-Path $percorso), [System.Text.Encoding]::UTF8)
}
function Scrivi([string]$percorso, [string]$testo) {
  # UTF-8 senza BOM: e' quello che si aspetta il browser.
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($percorso, $testo, $enc)
}
function ElencaSegnaposto([string]$testo) {
  # Qualsiasi cosa tra parentesi quadre che inizi con maiuscola o cifra,
  # senza limite di lunghezza: prende anche [24] e le note lunghe.
  $m = [regex]::Matches($testo, '\[[A-Z0-9][^\[\]]*\]')
  return @($m | ForEach-Object { $_.Value } | Select-Object -Unique)
}

if (-not $SoloElenco) {
  Write-Host ""
  Write-Host "Dati da inserire (lascia vuoto per saltare un campo)" -ForegroundColor Cyan
  Write-Host ""

  $oggi = Get-Date -Format "dd/MM/yyyy"
  $campi = [ordered]@{}
  $campi["DATA"]                   = Read-Host "Data di entrata in vigore [$oggi]"
  if (-not $campi["DATA"]) { $campi["DATA"] = $oggi }
  $campi["RAGIONE SOCIALE"]        = Read-Host "Ragione sociale completa"
  $campi["INDIRIZZO SEDE LEGALE"]  = Read-Host "Indirizzo sede legale"
  $campi["P.IVA"]                  = Read-Host "Partita IVA"
  $campi["CCIAA"]                  = Read-Host "Camera di commercio"
  $campi["REA"]                    = Read-Host "Numero REA"
  $campi["EMAIL ASSISTENZA"]       = Read-Host "Email assistenza clienti"
  $campi["EMAIL PRIVACY"]          = Read-Host "Email per le richieste privacy"
  $campi["PEC"]                    = Read-Host "Indirizzo PEC"
  # CITTA' con accento: costruita da codice carattere per non mettere
  # lettere accentate dentro questo script.
  $chiaveCitta = "CITT" + [char]0x00C0
  $campi[$chiaveCitta]             = Read-Host "Citta' del foro competente"

  foreach ($f in $file) {
    $percorso = Join-Path $Cartella $f
    $testo = Leggi $percorso

    $copia = Join-Path $Cartella ($f -replace '\.html$', '-originale.html')
    if (-not (Test-Path $copia)) { Scrivi $copia $testo }

    $fatti = 0
    foreach ($k in $campi.Keys) {
      $valore = $campi[$k]
      if (-not $valore) { continue }
      $cercato = "[" + $k + "]"
      if ($testo.Contains($cercato)) {
        $testo = $testo.Replace($cercato, $valore)
        $fatti++
      }
    }
    Scrivi $percorso $testo
    Write-Host ("  {0,-20} {1} campi sostituiti" -f $f, $fatti) -ForegroundColor Green
  }
  Write-Host ""
  Write-Host "Copie di sicurezza salvate come *-originale.html" -ForegroundColor DarkGray
}

# --- Elenco completo di cio' che resta -------------------------------------
Write-Host ""
Write-Host "Ancora da completare a mano:" -ForegroundColor Cyan
$totale = 0
foreach ($f in $file) {
  $testo = Leggi (Join-Path $Cartella $f)
  $resti = ElencaSegnaposto $testo
  Write-Host ""
  if ($resti.Count -eq 0) {
    Write-Host "  $f : nulla, pronto" -ForegroundColor Green
    continue
  }
  Write-Host "  $f  ($($resti.Count))" -ForegroundColor Yellow
  foreach ($r in $resti) {
    $totale++
    $breve = if ($r.Length -gt 110) { $r.Substring(0, 107) + "..." } else { $r }
    Write-Host "    $breve" -ForegroundColor DarkYellow
  }
}
Write-Host ""
if ($totale -gt 0) {
  Write-Host "$totale voci residue. I numeri tra parentesi (per esempio [24]) sono i" -ForegroundColor DarkGray
  Write-Host "periodi di conservazione e le durate: decidili e togli le parentesi." -ForegroundColor DarkGray
  Write-Host "Le note lunghe vanno riscritte o rimosse insieme al legale." -ForegroundColor DarkGray
} else {
  Write-Host "Tutto compilato. Ora puoi lanciare .\carica-pagine-legali.ps1" -ForegroundColor Green
}
Write-Host ""
