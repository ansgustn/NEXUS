@echo off
chcp 65001 > nul
title NEXUS - AI 역사 인물 인터랙티브 시스템

echo ===============================================================================
echo     _   _ _______  ___   _ ____  
echo    ^| \ ^| ^| ____\ \/ / ^| ^| / ___^| 
echo    ^|  \^| ^|  _^|  \  /^| ^| ^| \___ \ 
echo    ^| ^|\  ^| ^|___  /  \^| ^|_^| ^|___) ^|
echo    ^|_^| \_^|_____^|/_/\_\\___/^|____/ 
echo.
echo    [NEXUS] AI 역사 인물 인터랙티브 시스템 원클릭 통합 실행기
echo ===============================================================================
echo.

:: 1. Node.js 설치 확인
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다!
    echo Node.js 공식 홈페이지에서 LTS 버전을 설치한 후 다시 실행해 주세요.
    echo 다운로드 링크: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. .env 환경 설정 파일 확인 및 자동 생성
if not exist ".env" (
    echo [INFO] .env 파일이 존재하지 않아 .env.example로부터 자동 생성합니다...
    copy ".env.example" ".env" > nul
    echo [INFO] .env 파일이 생성되었습니다. (필요 시 메모장으로 열어 수정 가능)
)

:: 3. node_modules 의존성 설치 확인
if not exist "node_modules\" (
    echo [INFO] 필요한 패키지(node_modules)가 없습니다. 패키지를 자동 설치합니다...
    echo 잠시만 기다려 주세요 (약 30초~1분 소요)...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] 패키지 설치 중 오류가 발생했습니다. 네트워크 연결을 확인해 주세요.
        pause
        exit /b 1
    )
    echo [INFO] 패키지 설치 완료!
)

:: 4. ComfyUI 구동 상태 확인 팁 안내
echo.
echo -------------------------------------------------------------------------------
echo [ComfyUI AI 엔진 체크]
echo  - 실시간 영상 립싱크를 위해서는 ComfyUI 서버(포트 8188)가 켜져 있어야 합니다.
echo  - ComfyUI가 아직 설치되지 않았다면: [install_comfyui.bat] 실행
echo  - ComfyUI를 바로 실행하려면         : [run_comfyui.bat] 실행
echo  - ComfyUI 없이도 사료 보관 영상 및 음성 재생은 100%% 정상 작동합니다.
echo -------------------------------------------------------------------------------
echo.

:: 5. 브라우저 자동 실행 예약 (3초 후 http://localhost:5173 열기)
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"

:: 6. 서버 및 클라이언트 동시 실행
echo [START] NEXUS 웹 서버와 프론트엔드를 기동합니다...
echo [INFO] 백엔드: http://localhost:3001
echo [INFO] 프론트엔드: http://localhost:5173
echo.
echo 종료하려면 창에서 Ctrl + C 를 누르세요.
echo ===============================================================================
echo.

npm run dev

pause
