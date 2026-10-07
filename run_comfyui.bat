@echo off
chcp 65001 > nul
title [NEXUS] ComfyUI AI 인퍼런스 서버 (--listen 0.0.0.0:8188)

echo ===============================================================================
echo     _   _ _______  ___   _ ____  
echo    ^| \ ^| ^| ____\ \/ / ^| ^| / ___^| 
echo    ^|  \^| ^|  _^|  \  /^| ^| ^| \___ \ 
echo    ^| ^|\  ^| ^|___  /  \^| ^|_^| ^|___) ^|
echo    ^|_^| \_^|_____^|/_/\_\\___/^|____/ 
echo.
echo    [NEXUS] ComfyUI 외부 접속 허용 (0.0.0.0:8188) 원클릭 실행기
echo ===============================================================================
echo.

:: 1. ComfyUI 설치 디렉터리 자동 탐색
set "COMFY_DIR="

if exist "%~dp0ComfyUI_windows_portable\ComfyUI\main.py" (
    set "COMFY_DIR=%~dp0ComfyUI_windows_portable"
    goto FOUND
)

if exist "C:\Users\%USERNAME%\Desktop\ComfyUI_windows_portable\ComfyUI\main.py" (
    set "COMFY_DIR=C:\Users\%USERNAME%\Desktop\ComfyUI_windows_portable"
    goto FOUND
)

if exist "%~dp0..\ComfyUI_windows_portable\ComfyUI\main.py" (
    set "COMFY_DIR=%~dp0..\ComfyUI_windows_portable"
    goto FOUND
)

if exist "%~dp0ComfyUI\main.py" (
    set "COMFY_DIR=%~dp0ComfyUI"
    goto FOUND_STANDALONE
)

:NOT_FOUND
echo [ERROR] ComfyUI 설치 폴더를 찾을 수 없습니다!
echo.
echo 1. ComfyUI를 자동 설치하려면 먼저 [install_comfyui.bat]을 실행해 주세요.
echo 2. 이미 설치되어 있다면 폴더 이름을 'ComfyUI_windows_portable' 로 맞춰주세요.
echo.
pause
exit /b 1

:FOUND
echo [INFO] ComfyUI 포터블 환경을 감지했습니다: %COMFY_DIR%
cd /d "%COMFY_DIR%"

if exist "python_embeded\python.exe" (
    echo [START] 내장 Python으로 ComfyUI를 기동합니다...
    echo [OPTIONS] --windows-standalone-build --fast fp16_accumulation --listen 0.0.0.0 --port 8188
    echo.
    python_embeded\python.exe ComfyUI\main.py --windows-standalone-build --fast fp16_accumulation --listen 0.0.0.0 --port 8188
) else (
    echo [START] 시스템 Python으로 ComfyUI를 기동합니다...
    python ComfyUI\main.py --fast fp16_accumulation --listen 0.0.0.0 --port 8188
)
goto END

:FOUND_STANDALONE
echo [INFO] ComfyUI 독립 폴더를 감지했습니다: %COMFY_DIR%
cd /d "%COMFY_DIR%"
python main.py --fast fp16_accumulation --listen 0.0.0.0 --port 8188
goto END

:END
pause
