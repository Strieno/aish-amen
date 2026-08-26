@echo off
setlocal
title Aish Aman
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.5 or newer is required.
  echo https://nodejs.org
  pause
  exit /b 1
)

node scripts\launch.mjs
if errorlevel 1 pause
endlocal
