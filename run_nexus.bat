@echo off
setlocal
title NEXUS - AI Historical Figures Interactive System
cd /d "%~dp0"
where powershell >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Windows PowerShell was not found. Please run on Windows 10 or later.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_nexus.ps1"
if %ERRORLEVEL% neq 0 pause
