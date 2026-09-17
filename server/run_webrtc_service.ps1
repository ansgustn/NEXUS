Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " [NEXUS] Local GPU WebRTC Real-Time Avatar Server (Port 8010)" -ForegroundColor Green
Write-Host " Low-Latency PyTorch CUDA Real-Time Avatar Streaming Service" -ForegroundColor Gray
Write-Host "====================================================================" -ForegroundColor Cyan

# Check and free port 8010 if occupied
$portProcess = Get-NetTCPConnection -LocalPort 8010 -State Listen -ErrorAction SilentlyContinue
if ($portProcess) {
    Write-Host "[INFO] Freeing port 8010 (PID: $($portProcess.OwningProcess))..." -ForegroundColor Yellow
    Stop-Process -Id $portProcess.OwningProcess -Force -ErrorAction SilentlyContinue
}

$pythonExe = "C:\Users\user\Desktop\ComfyUI_windows_portable\python_embeded\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Error "Cannot find embedded python at $pythonExe"
    exit 1
}

$webrtcDir = Join-Path $PSScriptRoot "webrtc"
Set-Location $webrtcDir
& $pythonExe "avatar_webrtc_server.py"
