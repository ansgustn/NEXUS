# ==============================================================================
# [NEXUS] AI 역사 인물 인터랙티브 시스템 원클릭 통합 실행 스크립트
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $Host.UI.RawUI.WindowTitle = "NEXUS - AI 역사 인물 인터랙티브 시스템"
} catch {}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "    _   _ _______  ___   _ ____  " -ForegroundColor Cyan
Write-Host "   | \ | | ____\ \/ / | | / ___| " -ForegroundColor Cyan
Write-Host "   |  \| |  _|  \  /| | | \___ \ " -ForegroundColor Cyan
Write-Host "   | |\  | |___  /  \| |_| |___) |" -ForegroundColor Cyan
Write-Host "   |_| \_|_____|/_/\_\\___/|____/ " -ForegroundColor Cyan
Write-Host ""
Write-Host "   [NEXUS] AI 역사 인물 인터랙티브 시스템 원클릭 통합 실행기" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $baseDir

# 1. Node.js 확인
$hasNode = (Get-Command node -ErrorAction SilentlyContinue) -ne $null
if (-not $hasNode) {
    Write-Host "[ERROR] Node.js가 설치되어 있지 않습니다!" -ForegroundColor Red
    Write-Host "Node.js 공식 홈페이지에서 LTS 버전을 설치한 후 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host "다운로드 링크: https://nodejs.org/" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "계속하려면 엔터 키를 누르세요..."
    exit 1
}

# 2. .env 환경 설정 파일 확인 및 자동 생성
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "[INFO] .env 파일이 존재하지 않아 .env.example로부터 자동 생성합니다..." -ForegroundColor Cyan
        Copy-Item ".env.example" ".env"
        Write-Host "[INFO] .env 파일이 생성되었습니다. (필요 시 메모장으로 열어 수정 가능)" -ForegroundColor Green
    }
}

# 3. node_modules 의존성 확인
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] 필요한 패키지(node_modules)가 없습니다. 패키지를 자동 설치합니다..." -ForegroundColor Cyan
    Write-Host "잠시만 기다려 주세요 (약 30초~1분 소요)..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] 패키지 설치 중 오류가 발생했습니다. 네트워크 연결을 확인해 주세요." -ForegroundColor Red
        Read-Host "계속하려면 엔터 키를 누르세요..."
        exit 1
    }
    Write-Host "[INFO] 패키지 설치 완료!" -ForegroundColor Green
}

# 4. ComfyUI 구동 상태 안내
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "[ComfyUI AI 엔진 체크]" -ForegroundColor Yellow
Write-Host " - 실시간 영상 립싱크를 위해서는 ComfyUI 서버(포트 8188)가 켜져 있어야 합니다." -ForegroundColor Gray
Write-Host " - ComfyUI가 아직 설치되지 않았다면 : [install_comfyui.bat] 실행" -ForegroundColor Gray
Write-Host " - ComfyUI를 바로 실행하려면         : [run_comfyui.bat] 실행" -ForegroundColor Gray
Write-Host " - ComfyUI 없이도 사료 보관 영상 및 음성 재생은 100% 정상 작동합니다." -ForegroundColor Gray
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host ""

# 5. 브라우저 자동 실행 예약 (3초 후 http://localhost:5173 열기)
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:5173"
} | Out-Null

# 6. 서버 및 클라이언트 동시 실행
Write-Host "[START] NEXUS 웹 서버와 프론트엔드를 기동합니다..." -ForegroundColor Green
Write-Host "[INFO] 백엔드  : http://localhost:3001" -ForegroundColor Cyan
Write-Host "[INFO] 프론트엔드: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "종료하려면 창에서 Ctrl + C 를 누르세요." -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

try {
    npm run dev
} catch {
    Write-Host ""
    Write-Host "[ERROR] 서버 실행 중 오류가 발생했습니다: $_" -ForegroundColor Red
} finally {
    Write-Host ""
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[INFO] NEXUS 서버 프로세스가 종료되었습니다." -ForegroundColor Yellow
    Write-Host "종료 원인 확인을 위해 창을 자동으로 닫지 않고 유지합니다." -ForegroundColor Gray
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
    Read-Host "창을 완전히 닫으려면 [엔터(Enter)] 키를 누르세요..."
}
