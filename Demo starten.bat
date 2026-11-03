@echo off
rem Startet die Demo der Billardcafe-Rangliste lokal (App + Cafe-Bildschirm). Kein Installieren noetig.
cd /d "%~dp0"
title Billardcafe Merzig - Demo
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\demo-server.ps1"
if errorlevel 1 pause
