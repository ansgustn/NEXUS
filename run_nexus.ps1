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

$baseDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
Set-Location $baseDir

# ------------------------------------------------------------------------------
# 1. Node.js 확인
# ------------------------------------------------------------------------------
$hasNode = (Get-Command node -ErrorAction SilentlyContinue) -ne $null
$hasNpm = (Get-Command npm -ErrorAction SilentlyContinue) -ne $null
if (-not $hasNode -or -not $hasNpm) {
    Write-Host "[ERROR] Node.js(npm 포함)가 설치되어 있지 않습니다!" -ForegroundColor Red
    Write-Host "Node.js 공식 홈페이지에서 LTS 버전(20 이상 권장)을 설치한 후 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host "다운로드 링크: https://nodejs.org/" -ForegroundColor Cyan
    Write-Host "※ 설치 직후라면 이 창을 닫고 run_nexus.bat 을 다시 실행해야 PATH가 반영됩니다." -ForegroundColor Gray
    Write-Host ""
    Read-Host "계속하려면 [엔터(Enter)] 키를 누르세요..."
    exit 1
}

# Node.js 버전 확인 (Vite 5 는 Node 18 이상 필요)
$nodeVersionRaw = (& node -v) 2>$null
$nodeMajor = 0
if ($nodeVersionRaw -match '^v(\d+)\.') { $nodeMajor = [int]$Matches[1] }
if ($nodeMajor -lt 18) {
    Write-Host "[ERROR] Node.js 버전이 너무 낮습니다 (현재: $nodeVersionRaw, 필요: v18 이상)." -ForegroundColor Red
    Write-Host "https://nodejs.org/ 에서 최신 LTS 버전을 설치한 후 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "계속하려면 [엔터(Enter)] 키를 누르세요..."
    exit 1
}
Write-Host "[INFO] Node.js $nodeVersionRaw 확인 완료" -ForegroundColor Green

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
# node_modules 가 없거나, 다른 PC에서 복사되어 깨진 경우(esbuild 등 플랫폼 전용 바이너리 불일치)까지 감지
$needNpmInstall = $false
$npmReason = ""
if (-not (Test-Path "node_modules")) {
    $needNpmInstall = $true
    $npmReason = "필요한 Node.js 패키지(node_modules)가 없습니다."
} else {
    & node -e "for (const m of ['express','cors','multer','ws','react','react-dom','vite','concurrently','@vitejs/plugin-react']) require.resolve(m + '/package.json'); require('esbuild').transformSync('let a=1');" 2>$null
    if ($LASTEXITCODE -ne 0) {
        $needNpmInstall = $true
        $npmReason = "Node.js 패키지가 누락되었거나 현재 PC 환경과 맞지 않습니다 (다른 PC에서 복사된 node_modules 등)."
    }
}

if ($needNpmInstall) {
    Write-Host "[INFO] $npmReason" -ForegroundColor Cyan
    Write-Host "[INFO] npm install 을 자동으로 실행합니다 (약 30초~1분 소요)..." -ForegroundColor Yellow
    if (Test-Path "node_modules") {
        # 플랫폼이 다른 바이너리가 남지 않도록 기존 폴더 정리 후 재설치
        Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
    }
    npm install --no-audit --no-fund
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

# 실제로 실행되는 Python만 인정 (Windows 기본 'Microsoft Store 바로가기' python.exe 는 실행되지 않으므로 제외)
# 서버(ttsService.js)와 동일한 우선순위: python -> py
$pythonCmd = $null
foreach ($cand in @("python", "py")) {
    if (Get-Command $cand -ErrorAction SilentlyContinue) {
        try {
            $verOut = (& $cand --version) 2>$null
            if ($LASTEXITCODE -eq 0 -and "$verOut" -match "Python 3") {
                $pythonCmd = $cand
                break
            }
        } catch {}
    }
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
    
    # 필수 패키지 점검: edge-tts (음성 합성), imageio-ffmpeg (ffmpeg 미설치 PC용 오디오/영상 처리)
    $pyCheck = "import edge_tts, imageio_ffmpeg"
    $hasPyDeps = $false
    try {
        & $pythonCmd -c $pyCheck 2>$null
        if ($LASTEXITCODE -eq 0) { $hasPyDeps = $true }
    } catch {}

    if (-not $hasPyDeps) {
        Write-Host "[INFO] 음성 합성용 Python 패키지(edge-tts, imageio-ffmpeg)를 자동 설치합니다..." -ForegroundColor Cyan
        try {
            # pip 자체가 없는 Python 대비
            & $pythonCmd -m pip --version 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) {
                & $pythonCmd -m ensurepip --upgrade 2>$null | Out-Null
            }

            $pipArgs = @("-m", "pip", "install", "--disable-pip-version-check")
            if (Test-Path "requirements.txt") { $pipArgs += @("-r", "requirements.txt") } else { $pipArgs += @("edge-tts>=7.0.0", "imageio-ffmpeg") }

            & $pythonCmd @pipArgs
            if ($LASTEXITCODE -ne 0) {
                # 관리자 권한이 필요한 위치(Program Files 등)에 설치된 Python 대비: 사용자 영역에 재시도
                Write-Host "[INFO] 사용자 영역(--user)으로 재시도합니다..." -ForegroundColor Yellow
                & $pythonCmd @($pipArgs + "--user")
            }

            & $pythonCmd -c $pyCheck 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[INFO] ✅ Python 패키지 설치가 완료되었습니다!" -ForegroundColor Green
            } else {
                Write-Host "[WARNING] Python 패키지 설치에 실패했습니다. 수동으로 '$pythonCmd -m pip install edge-tts imageio-ffmpeg'를 시도해 주세요." -ForegroundColor Yellow
                Write-Host "[WARNING] (설치 전에도 미리 생성된 영상/음성 재생은 정상 동작합니다)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[WARNING] pip 실행 중 오류: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[INFO] ✅ 필수 Python 패키지 (edge-tts, imageio-ffmpeg)가 정상적으로 준비되어 있습니다." -ForegroundColor Green
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
# 이전에 실행한 NEXUS 가 남아 포트(3001/5173)를 점유하고 있으면 새 서버가 다른 포트로 밀려
# 프론트엔드 프록시가 엉뚱한 서버에 붙으므로, 먼저 점검하고 정리합니다.
$backendPort = 3001
try {
    $envPortLine = Get-Content ".env" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)' } | Select-Object -First 1
    if ($envPortLine -match '^\s*PORT\s*=\s*(\d+)') { $backendPort = [int]$Matches[1] }
} catch {}

foreach ($port in @($backendPort, 5173)) {
    $owners = @()
    try {
        $owners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {}
    foreach ($procId in $owners) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if (-not $proc) { continue }
        Write-Host "[경고] 포트 $port 를 이미 사용 중인 프로그램이 있습니다: $($proc.ProcessName) (PID $procId)" -ForegroundColor Yellow
        if ($proc.ProcessName -eq "node") {
            Write-Host "       이전에 실행한 NEXUS 서버로 보입니다. 종료하고 새로 시작할까요? (Y/N) [기본값: Y]: " -NoNewline -ForegroundColor Yellow
            $ans = Read-Host
            if ($ans -eq "" -or $ans -match "^[yY]") {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 800
                Write-Host "[INFO] 이전 프로세스(PID $procId)를 종료했습니다." -ForegroundColor Green
            }
        } else {
            Write-Host "       해당 프로그램을 종료한 후 다시 실행해 주세요. (NEXUS는 다른 포트로 우회 실행될 수 있습니다)" -ForegroundColor Yellow
        }
    }
}

# 고정 3초 대기 대신, 프론트엔드가 실제로 응답할 때 브라우저를 엽니다 (첫 실행/느린 PC 대비, 최대 90초)
try {
    Start-Job -ScriptBlock {
        for ($i = 0; $i -lt 90; $i++) {
            Start-Sleep -Seconds 1
            try {
                $client = New-Object System.Net.Sockets.TcpClient
                $client.Connect("127.0.0.1", 5173)
                $client.Close()
                Start-Sleep -Seconds 1
                break
            } catch {}
        }
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
