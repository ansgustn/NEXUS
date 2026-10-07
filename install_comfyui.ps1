# ==============================================================================
# [NEXUS] ComfyUI & Wav2Lip 초고속 원클릭 자동 설치 스크립트
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "   [NEXUS] ComfyUI + Wav2Lip + EdgeTTS 원클릭 자동 설치 및 환경 구성" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. 설치 경로 확인 및 결정
$targetComfyDir = "$baseDir\ComfyUI_windows_portable"
$altDir = "C:\Users\$env:USERNAME\Desktop\ComfyUI_windows_portable"

if (Test-Path $altDir) {
    $targetComfyDir = $altDir
    Write-Host "[INFO] 기존 바탕화면 ComfyUI 폴더를 감지했습니다: $targetComfyDir" -ForegroundColor Green
} elseif (Test-Path $targetComfyDir) {
    Write-Host "[INFO] 프로젝트 내 ComfyUI 폴더를 감지했습니다: $targetComfyDir" -ForegroundColor Green
} else {
    Write-Host "[INFO] 설치 대상 디렉터리: $targetComfyDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $targetComfyDir | Out-Null
}

$comfyAppDir = "$targetComfyDir\ComfyUI"
$customNodesDir = "$comfyAppDir\custom_nodes"
$pythonExe = "$targetComfyDir\python_embeded\python.exe"

# 2. ComfyUI 기본 프로그램 설치 여부 검사
if (-not (Test-Path "$comfyAppDir\main.py")) {
    Write-Host ""
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "[1단계] ComfyUI 핵심 파일 설치 시작..." -ForegroundColor Yellow
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow

    # Git 설치 여부 확인
    $hasGit = (Get-Command git -ErrorAction SilentlyContinue) -ne $null
    if ($hasGit) {
        Write-Host ">> Git을 감지했습니다. 공식 ComfyUI 저장소를 클론합니다..." -ForegroundColor Cyan
        git clone https://github.com/comfyanonymous/ComfyUI.git "$comfyAppDir"
    } else {
        Write-Host ">> Git이 감지되지 않았습니다. ComfyUI 소스코드를 직접 다운로드합니다..." -ForegroundColor Cyan
        $zipUrl = "https://github.com/comfyanonymous/ComfyUI/archive/refs/heads/master.zip"
        $zipDest = "$targetComfyDir\comfyui_master.zip"
        
        Write-Host ">> 다운로드 중: $zipUrl" -ForegroundColor Cyan
        try {
            Invoke-WebRequest -Uri $zipUrl -OutFile $zipDest
            Expand-Archive -Path $zipDest -DestinationPath "$targetComfyDir" -Force
            Remove-Item $zipDest -Force
            if (Test-Path "$targetComfyDir\ComfyUI-master") {
                Rename-Item -Path "$targetComfyDir\ComfyUI-master" -NewName "ComfyUI" -Force
            }
            Write-Host ">> ComfyUI 다운로드 및 압축 해제 완료!" -ForegroundColor Green
        } catch {
            Write-Host "[ERROR] ComfyUI 다운로드 실패: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[OK] ComfyUI 메인 파일이 이미 존재합니다: $comfyAppDir" -ForegroundColor Green
}

# custom_nodes 폴더 생성
if (-not (Test-Path $customNodesDir)) {
    New-Item -ItemType Directory -Force -Path $customNodesDir | Out-Null
}

# 3. 필수 커스텀 노드 설치
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host "[2단계] 필수 커스텀 노드 설치 (Wav2Lip, VideoHelperSuite, EdgeTTS)..." -ForegroundColor Yellow
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow

function Install-CustomNode {
    param (
        [string]$NodeName,
        [string]$GitUrl,
        [string]$ZipUrl
    )
    $dest = "$customNodesDir\$NodeName"
    if (Test-Path $dest) {
        Write-Host "  [OK] $NodeName 가 이미 설치되어 있습니다." -ForegroundColor Green
        return
    }

    Write-Host "  >> $NodeName 설치 중..." -ForegroundColor Cyan
    $hasGit = (Get-Command git -ErrorAction SilentlyContinue) -ne $null
    if ($hasGit) {
        git clone $GitUrl $dest
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [성공] $NodeName Git 클론 완료!" -ForegroundColor Green
            return
        }
    }

    # Fallback to ZIP download
    try {
        $tempZip = "$customNodesDir\$NodeName.zip"
        Write-Host "  >> ZIP 다운로드 중: $ZipUrl" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $ZipUrl -OutFile $tempZip
        Expand-Archive -Path $tempZip -DestinationPath "$customNodesDir" -Force
        Remove-Item $tempZip -Force
        # Handle folder name after expand
        $extractedDirs = Get-ChildItem -Path $customNodesDir -Directory | Where-Object { $_.Name -like "$NodeName*" -and $_.Name -ne $NodeName }
        if ($extractedDirs) {
            Rename-Item -Path $extractedDirs[0].FullName -NewName $NodeName -Force
        }
        Write-Host "  [성공] $NodeName ZIP 설치 완료!" -ForegroundColor Green
    } catch {
        Write-Host "  [경고] $NodeName 다운로드 실패: $_" -ForegroundColor Red
    }
}

# 1) ComfyUI_wav2lip
Install-CustomNode -NodeName "ComfyUI_wav2lip" `
    -GitUrl "https://github.com/Wild-B/ComfyUI_wav2lip.git" `
    -ZipUrl "https://github.com/Wild-B/ComfyUI_wav2lip/archive/refs/heads/master.zip"

# 2) ComfyUI-VideoHelperSuite (VHS)
Install-CustomNode -NodeName "ComfyUI-VideoHelperSuite" `
    -GitUrl "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git" `
    -ZipUrl "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/archive/refs/heads/main.zip"

# 3) comfyui-edgetts
Install-CustomNode -NodeName "comfyui-edgetts" `
    -GitUrl "https://github.com/AIGODLIKE/comfyui-edgetts.git" `
    -ZipUrl "https://github.com/AIGODLIKE/comfyui-edgetts/archive/refs/heads/main.zip"


# 4. 필수 모델 가중치(Checkpoints) 다운로드
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host "[3단계] Wav2Lip 필수 딥러닝 모델 가중치 파일 다운로드..." -ForegroundColor Yellow
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Yellow

$wav2lipBase = "$customNodesDir\ComfyUI_wav2lip\Wav2Lip"
$ckptDir = "$wav2lipBase\checkpoints"
$sfdDir = "$wav2lipBase\face_detection\detection\sfd"

if (-not (Test-Path $ckptDir)) { New-Item -ItemType Directory -Force -Path $ckptDir | Out-Null }
if (-not (Test-Path $sfdDir)) { New-Item -ItemType Directory -Force -Path $sfdDir | Out-Null }

function Download-ModelFile {
    param (
        [string]$FileName,
        [string]$TargetDir,
        [string]$DownloadUrl,
        [long]$ExpectedMinBytes
    )
    $filePath = "$TargetDir\$FileName"
    if (Test-Path $filePath) {
        $fileSize = (Get-Item $filePath).Length
        if ($fileSize -ge $ExpectedMinBytes) {
            Write-Host "  [OK] $FileName 모델이 이미 존재합니다 ($([math]::Round($fileSize/1MB, 1)) MB)." -ForegroundColor Green
            return
        } else {
            Write-Host "  [INFO] $FileName 파일 크기가 비정상적이어서 재다운로드합니다." -ForegroundColor Yellow
            Remove-Item $filePath -Force
        }
    }

    Write-Host "  >> $FileName 다운로드 중 (대용량 파일이므로 잠시 기다려주세요)..." -ForegroundColor Cyan
    Write-Host "     URL: $DownloadUrl" -ForegroundColor Gray

    try {
        # curl.exe 가 있으면 프로그레스 바와 함께 빠르게 다운로드
        $hasCurl = (Get-Command curl.exe -ErrorAction SilentlyContinue) -ne $null
        if ($hasCurl) {
            & curl.exe -L --progress-bar -o "$filePath" "$DownloadUrl"
        } else {
            Invoke-WebRequest -Uri $DownloadUrl -OutFile "$filePath"
        }

        if (Test-Path $filePath) {
            $finalSize = (Get-Item $filePath).Length
            if ($finalSize -ge $ExpectedMinBytes) {
                Write-Host "  [성공] $FileName 다운로드 완료! ($([math]::Round($finalSize/1MB, 1)) MB)" -ForegroundColor Green
            } else {
                Write-Host "  [경고] $FileName 다운로드 크기 부족 (다운로드 중단됨). 수동 다운로드가 필요할 수 있습니다." -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "  [ERROR] $FileName 다운로드 실패: $_" -ForegroundColor Red
    }
}

# 1) wav2lip_gan.pth (415.6 MB)
Download-ModelFile -FileName "wav2lip_gan.pth" `
    -TargetDir $ckptDir `
    -DownloadUrl "https://huggingface.co/Akumzy/wav2lip-HD/resolve/main/wav2lip_gan.pth" `
    -ExpectedMinBytes 350000000

# 2) s3fd.pth (85.7 MB)
Download-ModelFile -FileName "s3fd.pth" `
    -TargetDir $sfdDir `
    -DownloadUrl "https://huggingface.co/camenduru/Wav2Lip/resolve/main/s3fd.pth" `
    -ExpectedMinBytes 80000000


# 5. 설치 완료 안내 및 점검
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "   🎉 ComfyUI AI 립싱크 환경 구성이 완료되었습니다!" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host " ComfyUI 폴더 위치 : $targetComfyDir" -ForegroundColor Cyan
Write-Host " 실행 방법         : [run_comfyui.bat] 파일을 더블 클릭하여 실행하세요." -ForegroundColor Yellow
Write-Host " NEXUS 실행        : [run_nexus.bat] 파일을 더블 클릭하여 실행하세요." -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host ""
