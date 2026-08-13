@echo off
title INBUS - Avvio completo
echo ============================================
echo   INBUS - Avvio database + backend + sito
echo ============================================
echo.

echo [1/3] Avvio il database (Docker)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo ERRORE: Docker non risponde. Assicurati che Docker Desktop sia aperto
  echo e che l'icona della balena in basso a destra sia stabile, poi riprova.
  pause
  exit /b 1
)

echo.
echo [2/3] Avvio il backend in una nuova finestra...
start "INBUS - Backend (API)" cmd /k "cd packages\backend && npm run dev"

timeout /t 4 /nobreak >nul

echo [3/3] Avvio il sito e il gestionale in una nuova finestra...
start "INBUS - Frontend (sito + gestionale)" cmd /k "cd packages\frontend && npm run dev"

echo.
echo ============================================
echo   Fatto! Tra qualche secondo apri il browser su:
echo     Sito:        http://localhost:5173
echo     Gestionale:  http://localhost:5173/admin.html
echo ============================================
echo.
echo Per FERMARE tutto: chiudi le due finestre nere aperte,
echo poi esegui STOP.bat per spegnere anche il database.
echo.
pause
