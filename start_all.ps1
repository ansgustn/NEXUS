# ==============================================================================
# [NEXUS] ComfyUI + 웹 서비스 올인원 통합 실행기
# ==============================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
    $Host.UI.RawUI.WindowTitle = "[NEXUS] 전체 시스템 올인원 런처 (ComfyUI + Web App)"
} catch {}

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "    _   _ _______  ___   _ ____  " -ForegroundColor Cyan
Write-Host "   | \ | | ____\ \/ / | | / ___| " -ForegroundColor Cyan
Write-Host "   |  \| |  _|  \  /| | | \___ \ " -ForegroundColor Cyan
Write-Host "   | |\  | |___  /  \| |_| |___) |" -ForegroundColor Cyan
Write-Host "   |_| \_|_____|/_/\_\\___/|____/ " -ForegroundColor Cyan
Write-Host ""
Write-Host "   [NEXUS] ComfyUI + 웹 서비스 올인원 통합 실행기" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }

Write-Host "1. ComfyUI AI 인퍼런스 서버를 새 창에서 기동합니다..." -ForegroundColor Cyan
Start-Process cmd.exe -ArgumentList "/c `"$baseDir\run_comfyui.bat`""

Write-Host "2. ComfyUI 기동 대기 중 (5초)..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "3. NEXUS 웹 애플리케이션(백엔드 + 프론트엔드)을 기동합니다..." -ForegroundColor Green
& powershell -NoProfile -ExecutionPolicy Bypass -File "$baseDir\run_nexus.ps1"
