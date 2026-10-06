# Runs the DeadKernel Vesktop build with this repo's Vencord, next to the regular Discord app.
#   powershell -File personal/tools/vesktop-dev.ps1 [-Build] [-Port 9223]
# Profile: %APPDATA%\vesktop-deadkernel. Never touches %APPDATA%\discord, BetterDiscord, or
# the installed Vesktop's %APPDATA%\vesktop.
param(
    [switch]$Build,
    [int]$Port = 9223,
    [string]$Vesktop = (Join-Path $PSScriptRoot "..\..\..\vesktop")
)
$ErrorActionPreference = "Stop"

$vencord = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$vesktop = (Resolve-Path $Vesktop).Path
$data = Join-Path $env:APPDATA "vesktop-deadkernel"

if ($Build) {
    Push-Location $vencord; try { pnpm build --disable-updater; if ($LASTEXITCODE) { throw "vencord build failed" } } finally { Pop-Location }
    Push-Location $vesktop; try { npx -y pnpm@11.9.0 build; if ($LASTEXITCODE) { throw "vesktop build failed" } } finally { Pop-Location }
}

# First run only: skip the welcome tour, load our Vencord, and stay out of the real Discord's way
# (no Rich Presence server competing for its RPC port).
New-Item -ItemType Directory -Force $data | Out-Null
$state = Join-Path $data "state.json"
if (-not (Test-Path $state)) {
    @{ firstLaunch = $false; vencordDir = (Join-Path $vencord "dist") } | ConvertTo-Json | Out-File -Encoding ascii $state
}
$settings = Join-Path $data "settings.json"
if (-not (Test-Path $settings)) {
    @{ discordBranch = "stable"; arRPC = $false } | ConvertTo-Json | Out-File -Encoding ascii $settings
}

$env:VENCORD_USER_DATA_DIR = $data
$env:VESKTOP_SIDE_BY_SIDE = "1"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue # set when launched from an Electron-based terminal
$electron = Join-Path $vesktop "node_modules\electron\dist\electron.exe"
Start-Process -FilePath $electron -WorkingDirectory $vesktop -ArgumentList ".", "--remote-debugging-port=$Port"
Write-Host "Vesktop starting (profile $data, CDP :$Port)"
