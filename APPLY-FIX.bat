@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY-FIX.ps1"
echo.
pause
