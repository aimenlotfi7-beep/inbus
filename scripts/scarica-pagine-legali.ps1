<#
  scarica-pagine-legali.ps1
  Legge le pagine legali dal database (via API pubblica) e le riscrive nei
  file *-cms.html, per poterle committare su Git.

  Direzione inversa di carica-pagine-legali.ps1: serve dopo aver corretto
  un testo dal gestionale, per non perdere la modifica nel repository.

  USO
    .\scarica-pagine-legali.ps1
    .\scarica-pagine-legali.ps1 -ApiUrl "https://api.tuodominio.it" -Cartella ..\packages\backend\src\db\legali
    .\scarica-pagine-legali.ps1 -SoloDifferenze
#>

param(
  [string]   $ApiUrl   = "http://localhost:4000",
  [string]   $Cartella = ".",
  [string[]] $Solo,
  [switch]   $SoloDifferenze
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$pagine = @(
  @{ chiave = "privacy"; file = "privacy-cms.html" }
  @{ chiave = "cookie";  file = "cookie-cms.html"  }
  @{ chiave = "termini"; file = "termini-cms.html" }
)
if ($Solo) { $pagine = $pagine | Where-Object { $Solo -contains $_.chiave } }
if (-not $pagine) { throw "Nessuna pagina selezionata. Valori validi: privacy, cookie, termini." }

if (-not (Test-Path $Cartella)) { throw "Cartella non trovata: $Cartella" }

Write-Host ""
Write-Host "Lettura da $ApiUrl" -ForegroundColor Cyan
Write-Host ""

$modificati = 0
foreach ($p in $pagine) {
  $percorso = Join-Path $Cartella $p.file

  try {
    $remota = Invoke-RestMethod -Uri "$ApiUrl/api/pagine/$($p.chiave)" -Method Get
  } catch {
    Write-Host ("  {0,-8} lettura fallita: {1}" -f $p.chiave, $_.Exception.Message) -ForegroundColor Red
    continue
  }

  if (-not $remota -or -not $remota.contenuto) {
    Write-Host ("  {0,-8} non ancora pubblicata sul database" -f $p.chiave) -ForegroundColor DarkGray
    continue
  }

  $nuovo = $remota.contenuto
  $vecchio = ""
  if (Test-Path $percorso) {
    $vecchio = [System.IO.File]::ReadAllText((Resolve-Path $percorso), [System.Text.Encoding]::UTF8)
  }

  if ($vecchio -eq $nuovo) {
    Write-Host ("  {0,-8} identica al file locale" -f $p.chiave) -ForegroundColor DarkGray
    continue
  }

  $delta = $nuovo.Length - $vecchio.Length
  $segno = if ($delta -ge 0) { "+" } else { "" }
  Write-Host ("  {0,-8} diversa  ({1}{2} caratteri)" -f $p.chiave, $segno, $delta) -ForegroundColor Yellow

  if ($SoloDifferenze) { continue }

  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($percorso, $nuovo, $enc)
  Write-Host ("           scritto in {0}" -f $percorso) -ForegroundColor Green
  $modificati++
}

Write-Host ""
if ($SoloDifferenze) {
  Write-Host "Solo confronto: nessun file modificato." -ForegroundColor DarkGray
} elseif ($modificati -gt 0) {
  Write-Host "$modificati file aggiornati. Ora puoi committare:" -ForegroundColor Cyan
  Write-Host "  git add $Cartella" -ForegroundColor DarkGray
  Write-Host "  git commit -m ""Aggiorna pagine legali dal gestionale""" -ForegroundColor DarkGray
} else {
  Write-Host "Nulla da aggiornare: repository e database sono allineati." -ForegroundColor Green
}
Write-Host ""
