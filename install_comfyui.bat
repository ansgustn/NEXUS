@echo off
chcp 65001 > nul
title [NEXUS] ComfyUI & AI 가중치 모델 원클릭 자동 설치기

echo ===============================================================================
echo     _   _ _______  ___   _ ____  
echo    ^| \ ^| ^| ____\ \/ / ^| ^| / ___^| 
echo    ^|  \^| ^|  _^|  \  /^| ^| ^| \___ \ 
echo    ^| ^|\  ^| ^|___  /  \^| ^|_^| ^|___) ^|
echo    ^|_^| \_^|_____^|/_/\_\\___/^|____/ 
echo.
echo    [NEXUS] ComfyUI 및 Wav2Lip AI 가중치 모델 원클릭 설치 스크립트
echo ===============================================================================
echo.
echo ComfyUI 코어, 필수 커스텀 노드(Wav2Lip, VideoHelperSuite, EdgeTTS),
echo 그리고 딥러닝 가중치 모델(wav2lip_gan.pth, s3fd.pth)을 자동으로 다운로드합니다.
echo.
echo 설치를 시작합니다... (네트워크 속도에 따라 수 분 소요될 수 있습니다)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_comfyui.ps1"

echo.
echo 설치 작업이 종료되었습니다.
pause
