@echo off
title INBUS - Arresto
echo Fermo il database...
docker compose down
echo.
echo Database fermato. Se le finestre nere del backend/frontend
echo sono ancora aperte, chiudile manualmente (o premi Ctrl+C dentro
echo ognuna e poi chiudile).
echo.
pause
