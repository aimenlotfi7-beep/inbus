@echo off
title INBUS - Pulizia dei dati di prova
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PULISCI-DATI.ps1"
echo.
pause
