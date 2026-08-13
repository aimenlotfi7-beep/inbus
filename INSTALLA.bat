@echo off
title INBUS - Prima installazione
echo ============================================
echo   INBUS - Prima installazione (una tantum)
echo ============================================
echo.
echo Questo script va eseguito UNA SOLA VOLTA, la prima volta
echo che scarichi il progetto. Le volte successive usa solo AVVIA.bat
echo.
pause

echo.
echo [1/4] Creo il file .env del backend (se non esiste già)...
if not exist "packages\backend\.env" (
  copy "packages\backend\.env.example" "packages\backend\.env"
  echo Creato packages\backend\.env
) else (
  echo Esiste già, non lo tocco.
)

echo.
echo [2/4] Installo le dipendenze del backend (puo' richiedere qualche minuto)...
cd packages\backend
call npm install
cd ..\..

echo.
echo [3/4] Installo le dipendenze del frontend...
cd packages\frontend
call npm install
cd ..\..

echo.
echo [4/4] Avvio il database e preparo le tabelle...
docker compose up -d
timeout /t 5 /nobreak >nul
cd packages\backend
call npm run db:migrate
call npm run seed
cd ..\..

echo.
echo ============================================
echo   Installazione completata!
echo   Da ora in poi, per avviare il progetto usa
echo   solo il file AVVIA.bat (doppio click).
echo ============================================
pause
