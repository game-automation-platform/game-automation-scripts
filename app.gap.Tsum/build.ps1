# A wrapper over tools/build/build.js, which is the build.
#
# This script and build.sh used to hold the same recipe twice, in two dialects,
# and had drifted -- this one wrote CRLF into dist/*.html, built its archive with
# a different tool, and pushed only when both -ADB and -Device were given. They
# translate flags now and nothing else, so there is one build and both shells run
# it. -ADB on its own pushes to the connected device, as build.sh has always done.
#
#   .\build.ps1 [-Channel Alpha] [-ADB] [-Device SERIAL]

param (
    [switch]$ADB,
    [string]$Device,
    [string]$Channel
)

# Not $args: that name is a PowerShell automatic variable.
$Passthrough = @()
if ($Channel) { $Passthrough += @('--channel', $Channel) }
if ($ADB) { $Passthrough += '--adb' }
if ($Device) { $Passthrough += @('--device', $Device) }

node (Join-Path $PSScriptRoot 'tools/build/build.js') @Passthrough
exit $LASTEXITCODE
