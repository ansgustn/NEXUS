@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_nexus.ps1"
if %ERRORLEVEL% neq 0 pause
