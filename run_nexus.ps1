# ==============================================================================
# [NEXUS] AI 역사 인물 인터랙티브 시스템 원클릭 통합 실행 스크립트
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $Host.UI.RawUI.WindowTitle = "NEXUS - AI 역사 인물 인터랙티브 시스템"
} catch {}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "    _   _ _______  ___   _ ____  " -ForegroundColor Cyan
Write-Host '   | \ | | ____\ \/ / | | / ___| ' -ForegroundColor Cyan
Write-Host '   |  \| |  _|  \  /| | | \___ \ ' -ForegroundColor Cyan
Write-Host '   | |\  | |___  /  \| |_| |___) |' -ForegroundColor Cyan
Write-Host '   |_| \_|_____|/_/\_\\___/|____/ ' -ForegroundColor Cyan
Write-Host ""
Write-Host "   [NEXUS] AI 역사 인물 인터랙티브 시스템 원클릭 통합 실행기" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $baseDir

# ------------------------------------------------------------------------------
# 1. Node.js 확인
# ------------------------------------------------------------------------------
$hasNode = (Get-Command node -ErrorAction SilentlyContinue) -ne $null
if (-not $hasNode) {
    Write-Host "[ERROR] Node.js가 설치되어 있지 않습니다!" -ForegroundColor Red
    Write-Host "Node.js 공식 홈페이지에서 LTS 버전을 설치한 후 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host "다운로드 링크: https://nodejs.org/" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "계속하려면 [엔터(Enter)] 키를 누르세요..."
    exit 1
}

# ------------------------------------------------------------------------------
# 2. .env 환경 설정 파일 확인 및 자동 생성
# ------------------------------------------------------------------------------
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "[INFO] .env 파일이 존재하지 않아 .env.example로부터 자동 생성합니다..." -ForegroundColor Cyan
        Copy-Item ".env.example" ".env"
        Write-Host "[INFO] .env 파일이 생성되었습니다." -ForegroundColor Green
    } else {
        # 기본 .env 생성
        Set-Content -Path ".env" -Value "PORT=3001`nCOMFYUI_URL=http://localhost:8188" -Encoding UTF8
        Write-Host "[INFO] 기본 .env 파일이 생성되었습니다." -ForegroundColor Green
    }
}

# ------------------------------------------------------------------------------
# 3. Node.js 패키지 (node_modules) 의존성 확인 및 자동 설치
# ------------------------------------------------------------------------------
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] 필요한 Node.js 패키지(node_modules)가 없습니다." -ForegroundColor Cyan
    Write-Host "[INFO] npm install 을 자동으로 실행합니다 (약 30초~1분 소요)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm 패키지 설치 중 오류가 발생했습니다. 네트워크 연결을 확인해 주세요." -ForegroundColor Red
        Read-Host "계속하려면 [엔터(Enter)] 키를 누르세요..."
        exit 1
    }
    Write-Host "[INFO] Node.js 패키지 설치 완료!" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 4. Python 환경 및 필수 pip 패키지 (edge-tts 등) 확인 및 자동 설치
# ------------------------------------------------------------------------------
Write-Host "[INFO] Python 환경 및 고품질 음성 합성(Edge-TTS) 패키지를 점검합니다..." -ForegroundColor Cyan

$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
}

if (-not $pythonCmd) {
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[경고] 시스템에서 Python을 찾을 수 없습니다!" -ForegroundColor Yellow
    Write-Host "역사 인물 고품질 AI 음성 합성(유관순, 신사임당, 김구 등)을 위해" -ForegroundColor Yellow
    Write-Host "Python 3.10 이상을 설치하시는 것을 강력히 권장합니다." -ForegroundColor Yellow
    Write-Host "다운로드 링크: https://www.python.org/downloads/" -ForegroundColor Cyan
    Write-Host "※ 설치 시 꼭 [Add python.exe to PATH] 체크박스를 선택해 주세요!" -ForegroundColor Yellow
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
} else {
    Write-Host "[INFO] 감지된 Python 명령어: $pythonCmd" -ForegroundColor Green
    
    # edge-tts 패키지 설치 여부 점검
    $hasEdgeTts = $false
    try {
        & $pythonCmd -c "import edge_tts" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $hasEdgeTts = $true
        }
    } catch {}

    if (-not $hasEdgeTts) {
        Write-Host "[INFO] 역사 인물 고유 음성 합성용 'edge-tts' 라이브러리가 없습니다." -ForegroundColor Yellow
        Write-Host "[INFO] pip install edge-tts 를 자동으로 진행합니다..." -ForegroundColor Cyan
        try {
            if (Test-Path "requirements.txt") {
                & $pythonCmd -m pip install -r requirements.txt
            } else {
                & $pythonCmd -m pip install edge-tts
            }

            if ($LASTEXITCODE -eq 0) {
                Write-Host "[INFO] ✅ edge-tts 패키지 설치가 완료되었습니다! (유관순/신사임당 전용 보이스 정상 구동)" -ForegroundColor Green
            } else {
                Write-Host "[WARNING] pip install 중 경고가 발생했습니다. 수동으로 'pip install edge-tts'를 시도해 주세요." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[WARNING] pip 실행 중 오류: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[INFO] ✅ 필수 음성 패키지 (edge-tts)가 정상적으로 준비되어 있습니다." -ForegroundColor Green
    }
}

# ------------------------------------------------------------------------------
# 5. ComfyUI 구동 상태 안내
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "[ComfyUI AI 엔진 체크]" -ForegroundColor Yellow
Write-Host " - 실시간 영상 립싱크 생성을 원하시면 ComfyUI 서버(포트 8188)를 실행해 주세요." -ForegroundColor Gray
Write-Host " - ComfyUI를 바로 실행하려면         : [run_comfyui.bat] 실행" -ForegroundColor Gray
Write-Host " - ComfyUI가 없어도 사료 보관 영상과 역사 음성은 100% 즉시 정상 재생됩니다." -ForegroundColor Gray
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------------------------
# 6. 브라우저 자동 실행 예약 (3초 후 http://localhost:5173 열기)
# ------------------------------------------------------------------------------
try {
    Start-Job -ScriptBlock {
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:5173"
    } -ErrorAction SilentlyContinue | Out-Null
} catch {}

# ------------------------------------------------------------------------------
# 7. 서버 및 클라이언트 동시 실행
# ------------------------------------------------------------------------------
Write-Host "[START] NEXUS 웹 서버와 프론트엔드를 기동합니다..." -ForegroundColor Green
Write-Host "[INFO] 백엔드  : http://localhost:3001" -ForegroundColor Cyan
Write-Host "[INFO] 프론트엔드: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "종료하려면 창에서 [Ctrl + C] 를 누르세요." -ForegroundColor Yellow
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
