@echo off
title NEXUS Local GPU WebRTC Real-Time Avatar Server (Port 8010)

echo ====================================================================
echo  [NEXUS] Local GPU WebRTC Real-Time Avatar Server (Port 8010)
echo  Low-Latency PyTorch CUDA Real-Time Avatar Streaming Service
echo ====================================================================

set "PYTHON_EXE=C:\Users\user\Desktop\ComfyUI_windows_portable\python_embeded\python.exe"

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Cannot find embedded python at %PYTHON_EXE%
    pause
    exit /b 1
)

cd /d "%~dp0webrtc"
"%PYTHON_EXE%" avatar_webrtc_server.py

pause
