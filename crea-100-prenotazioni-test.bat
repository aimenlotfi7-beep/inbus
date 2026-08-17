@echo off
cd /d "%~dp0packages\backend"

echo ============================================
echo  CREA PRENOTAZIONI DI TEST (produzione)
echo ============================================
echo.
echo Sto per aprire un collegamento al database online.
echo NON tocchera' il tuo file .env locale.
echo.
pause

start "Tunnel Railway - NON CHIUDERE finche' non hai finito" cmd /k "railway connect Postgres --tunnel-only"

echo.
echo Guarda la finestra "Tunnel Railway" appena apertasi: aspetta la riga
echo tipo "Listening on 127.0.0.1:XXXXX" e copia il numero della porta.
echo.
set /p PORTA=Porta del tunnel (solo il numero): 

set DATABASE_URL=postgresql://postgres:KzZJtkENXVZjFEccvlruWxALieBMUeAY@127.0.0.1:%PORTA%/railway

echo.
echo Eseguo lo script (ti chiedera' su quale evento lavorare)...
echo.
npx tsx crea-100-prenotazioni-test.ts

echo.
echo ============================================
echo Fatto. Ora vai sulla finestra "Tunnel Railway"
echo e premi Ctrl+C per chiuderla.
echo ============================================
pause
