# Builds Tsum and pushes dist\* straight into the emulator's script folder --
# the debug loop, sideways past the catalogue. `npm run release:*` is the other
# path: it publishes an archive for the app to install.

param (
    [string]$Channel
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$DistDir = Join-Path $ScriptDir "dist"

# The folder the app installs a catalogue script into is <publisher>/<game>/<name>,
# with spaces in the name turned into dashes. Deriving it from config.json is what
# keeps this pushing over the release the app already has, instead of beside it.
$Config = Get-Content -LiteralPath (Join-Path $ScriptDir "config.json") -Raw | ConvertFrom-Json
if (-not $Channel) { $Channel = $Config.DefaultChannel }
$ChannelConfig = $Config.Channels.$Channel
if (-not $ChannelConfig) {
    Write-Host "Unknown channel '$Channel'. config.json knows: $($Config.Channels.PSObject.Properties.Name -join ', ')."
    exit 1
}
$ScriptId = "$($Config.Publisher)/$($Config.Game)/$($ChannelConfig.Name -replace ' ', '-')"

# The app reads one folder, so the MuMu shared folder is no longer on its search
# path -- push over adb instead of copying. Which folder is `DevicePath` in
# config.json, because the tools that read records back off the device read it
# from the same place, and the two must not be able to disagree.
$DevicePath = if ($Config.DevicePath) { $Config.DevicePath } else { "/sdcard/Download/GameAutomationPlatform" }
$TargetDir = "$DevicePath/scripts/$ScriptId"

# build.ps1 uses relative paths, so run it from its own directory
Push-Location $ScriptDir
try {
    Write-Host "Running build.ps1..."
    & (Join-Path $ScriptDir "build.ps1") -Channel $Channel
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed (exit $LASTEXITCODE). Nothing was copied."
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $DistDir)) {
    Write-Host "Build produced no dist directory at $DistDir."
    exit 1
}

Write-Host "Pushing dist contents to $TargetDir..."
adb shell "mkdir -p '$TargetDir'"
Get-ChildItem -Path $DistDir -File | ForEach-Object {
    adb push $_.FullName "$TargetDir/"
    Write-Host "  $($_.Name)  ($($_.Length) bytes)"
}
$Images = Join-Path $DistDir "images"
if (Test-Path $Images) { adb push $Images "$TargetDir/" }
Write-Host "Deploy complete."
