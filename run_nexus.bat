@echo off
setlocal
title NEXUS - AI 역사 인물 인터랙티브 시스템
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_nexus.ps1"
if %ERRORLEVEL% neq 0 pause
