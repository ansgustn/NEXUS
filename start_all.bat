@echo off
chcp 65001 > nul
title [NEXUS] 전체 시스템 올인원 런처 (ComfyUI + Web App)

echo ===============================================================================
echo     _   _ _______  ___   _ ____  
echo    ^| \ ^| ^| ____\ \/ / ^| ^| / ___^| 
echo    ^|  \^| ^|  _^|  \  /^| ^| ^| \___ \ 
echo    ^| ^|\  ^| ^|___  /  \^| ^|_^| ^|___) ^|
echo    ^|_^| \_^|_____^|/_/\_\\___/^|____/ 
echo.
echo    [NEXUS] ComfyUI + 웹 서비스 올인원 통합 실행기
echo ===============================================================================
echo.

echo 1. ComfyUI AI 인퍼런스 서버를 새 창에서 기동합니다...
start "ComfyUI Server" cmd /c "%~dp0run_comfyui.bat"

echo 2. ComfyUI 기동 대기 중 (5초)...
timeout /t 5 /nobreak > nul

echo 3. NEXUS 웹 애플리케이션(백엔드 + 프론트엔드)을 기동합니다...
call "%~dp0run_nexus.bat"
