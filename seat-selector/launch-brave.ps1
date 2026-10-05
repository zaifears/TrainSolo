<#
.SYNOPSIS
    Launcher script to enable Playwright CDP connection on Brave Browser.
.DESCRIPTION
    Chromium/Brave requires the --remote-debugging-port=9222 flag on startup.
    This script gives you two choices:
    Option 1: Restart your existing Brave session with remote debugging (preserves all logins, cookies, tabs).
    Option 2: Launch a parallel Brave instance with an isolated automation profile.
#>

param (
    [switch]$UseMainProfile,
    [switch]$UseSeparateProfile
)

$BraveExe = "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
if (-not (Test-Path $BraveExe)) {
    $BraveExe = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
}

if (-not (Test-Path $BraveExe)) {
    Write-Error "Brave executable not found at standard locations. Please check installation."
    exit 1
}

$IsBraveRunning = (Get-Process -Name brave -ErrorAction SilentlyContinue).Count -gt 0
$IsPortListening = (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue).Count -gt 0

if ($IsPortListening) {
    Write-Host "✅ Brave is ALREADY running with remote debugging active on http://127.0.0.1:9222!" -ForegroundColor Green
    Write-Host "You can run Playwright commands right away." -ForegroundColor Cyan
    exit 0
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🦁 Brave Browser Playwright CDP Connector" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not $UseMainProfile -and -not $UseSeparateProfile) {
    Write-Host "Brave needs to start with --remote-debugging-port=9222 for Playwright to attach." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "How would you like to run Brave?" -ForegroundColor White
    Write-Host "  [1] USE EXISTING BRAVE SESSION (All logins, cookies, open tabs preserved)" -ForegroundColor Green
    Write-Host "      (Requires closing currently open Brave windows first so it can restart with the debug port)"
    Write-Host "  [2] LAUNCH SEPARATE BRAVE PROFILE (Keep current Brave open, new window for railway)" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Enter choice (1 or 2)"
    if ($choice -eq "1") { $UseMainProfile = $true } else { $UseSeparateProfile = $true }
}

if ($UseMainProfile) {
    if ($IsBraveRunning) {
        Write-Host ""
        Write-Host "⚠️  Brave is currently running without remote debugging." -ForegroundColor Yellow
        Write-Host "Chromium will NOT enable the debug port if an instance is already running without it."
        $confirm = Read-Host "Close all Brave windows now and relaunch with remote debugging? (y/n)"
        if ($confirm -eq 'y' -or $confirm -eq 'Y') {
            Get-Process -Name brave -ErrorAction SilentlyContinue | Stop-Process -Force
            Start-Sleep -Seconds 2
        } else {
            Write-Host "Aborted. To use Playwright on your existing session, close Brave and rerun this script." -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "Launching your existing Brave profile with remote debugging..." -ForegroundColor Green
    Start-Process -FilePath $BraveExe -ArgumentList @(
        "--remote-debugging-port=9222",
        "--remote-debugging-address=127.0.0.1",
        "--restore-last-session"
    )
} else {
    $SeparateProfileDir = "$PSScriptRoot\brave-profile"
    if (-not (Test-Path $SeparateProfileDir)) {
        New-Item -ItemType Directory -Path $SeparateProfileDir -Force | Out-Null
    }

    Write-Host "Launching separate Brave automation profile at $SeparateProfileDir..." -ForegroundColor Cyan
    Start-Process -FilePath $BraveExe -ArgumentList @(
        "--remote-debugging-port=9222",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=`"$SeparateProfileDir`"",
        "--no-first-run",
        "https://eticket.railway.gov.bd"
    )
}

Start-Sleep -Seconds 3
$NowListening = (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue).Count -gt 0
if ($NowListening) {
    Write-Host ""
    Write-Host "🎉 SUCCESS! Brave is now listening on http://127.0.0.1:9222" -ForegroundColor Green
    Write-Host "Playwright is ready to connect and inspect your tabs." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠️ Warning: Port 9222 is not yet detected. Please verify Brave opened." -ForegroundColor Yellow
}
