@echo off
title INBUS - Visualizza database
echo Avvio lo strumento per vedere i dati del database...
echo (si aprira' automaticamente nel browser tra pochi secondi)
echo.
cd packages\backend
call npm run db:studio
