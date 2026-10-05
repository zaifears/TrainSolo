# Dedicated Chrome Launcher for Bangladesh Railway Assistant
# Ensures CDP is bound strictly to loopback (127.0.0.1:9222) and uses an isolated profile directory.

$ProfileDir = "$PSScriptRoot\chrome-profile"
if (-not (Test-Path -Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    Write-Host "Created dedicated automation profile directory: $ProfileDir" -ForegroundColor Green
}

$ChromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$ChromeExe = $ChromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ChromeExe) {
    Write-Error "Google Chrome executable was not found in standard paths. Please verify Chrome is installed."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Launching Isolated Dedicated Chrome Profile..." -ForegroundColor Cyan
Write-Host "Chrome Binary: $ChromeExe" -ForegroundColor Gray
Write-Host "Profile Dir  : $ProfileDir" -ForegroundColor Gray
Write-Host "CDP Endpoint : http://127.0.0.1:9222" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Instructions:" -ForegroundColor White
Write-Host "1. In this newly opened browser window, log into https://eticket.railway.gov.bd" -ForegroundColor White
Write-Host "2. Complete any CAPTCHA / SMS OTP verification manually." -ForegroundColor White
Write-Host "3. Keep this browser window open." -ForegroundColor White
Write-Host "4. In your terminal, run: npm run dry-run" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process -FilePath $ChromeExe -ArgumentList @(
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    "--user-data-dir=`"$ProfileDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "https://eticket.railway.gov.bd"
)
