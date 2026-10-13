# ==============================================================================
# [NEXUS] ComfyUI AI 인퍼런스 서버 원클릭 실행 스크립트
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $Host.UI.RawUI.WindowTitle = "[NEXUS] ComfyUI AI 인퍼런스 서버 (Port 8188)"
} catch {}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "    _   _ _______  ___   _ ____  " -ForegroundColor Cyan
Write-Host "   | \ | | ____\ \/ / | | / ___| " -ForegroundColor Cyan
Write-Host "   |  \| |  _|  \  /| | | \___ \ " -ForegroundColor Cyan
Write-Host "   | |\  | |___  /  \| |_| |___) |" -ForegroundColor Cyan
Write-Host "   |_| \_|_____|/_/\_\\___/|____/ " -ForegroundColor Cyan
Write-Host ""
Write-Host "   [NEXUS] ComfyUI 외부 접속 허용 (0.0.0.0:8188) 원클릭 실행기" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. ComfyUI 디렉터리 후보 탐색
$candidates = @(
    "$baseDir\ComfyUI_windows_portable",
    "C:\Users\$env:USERNAME\Desktop\ComfyUI_windows_portable",
    "$baseDir\..\ComfyUI_windows_portable",
    "$baseDir\ComfyUI"
)

$comfyDir = $null
foreach ($path in $candidates) {
    if (Test-Path "$path\ComfyUI\main.py") {
        $comfyDir = $path
        break
    } elseif (Test-Path "$path\main.py") {
        $comfyDir = $path
        break
    }
}

# 2. 미설치 상태일 경우: 다운로드 폴더 패키지 확인 및 복구 안내
if (-not $comfyDir) {
    $dlArchive = "C:\Users\$env:USERNAME\Downloads\ComfyUI_windows_portable_nvidia.7z"
    Write-Host "[경고] 설치된 ComfyUI 폴더를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host ""

    if (Test-Path $dlArchive) {
        $sizeMB = [math]::Round((Get-Item $dlArchive).Length / 1MB, 1)
        Write-Host ">> 다운로드 폴더에서 공식 패키지를 감지했습니다: ($sizeMB MB)" -ForegroundColor Green
        Write-Host "   위치: $dlArchive" -ForegroundColor Gray
        Write-Host ""
        Write-Host "지금 이 위치($baseDir\ComfyUI_windows_portable)에 바로 압축을 해제하시겠습니까? (Y/N) [기본값: Y]: " -NoNewline -ForegroundColor Yellow
        $ans = Read-Host
        if ($ans -eq "" -or $ans -match "^[yY]") {
            Write-Host ">> 압축 해제 중입니다 (약 1~2분 소요될 수 있습니다)..." -ForegroundColor Cyan
            tar -xf "$dlArchive" -C "$baseDir"
            if (Test-Path "$baseDir\ComfyUI_windows_portable\ComfyUI\main.py") {
                Write-Host ">> 압축 해제 완료!" -ForegroundColor Green
                $comfyDir = "$baseDir\ComfyUI_windows_portable"
            } else {
                Write-Host "[오류] 압축 해제에 실패했습니다. 파일 무결성을 확인해 주세요." -ForegroundColor Red
            }
        }
    }

    if (-not $comfyDir) {
        Write-Host "1. 자동 설치를 진행하려면 먼저 [install_comfyui.bat]을 실행해 주세요." -ForegroundColor Yellow
        Write-Host "2. 수동 설치의 경우 폴더명을 'ComfyUI_windows_portable' 로 맞춰주세요." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "계속하려면 아무 키나 누르세요 (Enter)..."
        exit 1
    }
}

# 3. ComfyUI 구동
Write-Host "[INFO] ComfyUI 환경 감지: $comfyDir" -ForegroundColor Green
Set-Location $comfyDir

$pyEmbed = "$comfyDir\python_embeded\python.exe"
$mainPy = if (Test-Path "$comfyDir\ComfyUI\main.py") { "$comfyDir\ComfyUI\main.py" } else { "$comfyDir\main.py" }

if (Test-Path $pyEmbed) {
    Write-Host "[START] 내장 Python(CUDA 가속)으로 ComfyUI를 기동합니다..." -ForegroundColor Cyan
    Write-Host "[OPTIONS] --windows-standalone-build --fast fp16_accumulation --listen 0.0.0.0 --port 8188" -ForegroundColor Gray
    Write-Host ""
    & "$pyEmbed" "$mainPy" --windows-standalone-build --fast fp16_accumulation --listen 0.0.0.0 --port 8188
} else {
    Write-Host "[START] 시스템 Python으로 ComfyUI를 기동합니다..." -ForegroundColor Cyan
    Write-Host "[OPTIONS] --fast fp16_accumulation --listen 0.0.0.0 --port 8188" -ForegroundColor Gray
    Write-Host ""
    python "$mainPy" --fast fp16_accumulation --listen 0.0.0.0 --port 8188
}

Write-Host ""
Write-Host "ComfyUI 서버가 종료되었습니다." -ForegroundColor Yellow
Read-Host "계속하려면 아무 키나 누르세요 (Enter)..."
