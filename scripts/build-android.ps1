param([string]$BuildDirectory = "$env:LOCALAPPDATA\CodexPulse-build", [string]$ToolsDirectory = "$env:LOCALAPPDATA\CodexPulse-android-tools")
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Path $BuildDirectory -Force | Out-Null
Copy-Item -LiteralPath "$source\mobile" -Destination $BuildDirectory -Recurse -Force
$env:JAVA_HOME = (Get-ChildItem -LiteralPath "$ToolsDirectory\jdk" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = "$ToolsDirectory\sdk"
if (!(Test-Path -LiteralPath "$ToolsDirectory\gradle-8.13\bin\gradle.bat")) { throw 'Run scripts/bootstrap-android.ps1 first.' }
& "$ToolsDirectory\gradle-8.13\bin\gradle.bat" --no-daemon -p "$BuildDirectory\mobile\android" assembleDebug testDebugUnitTest lintDebug --console=plain
if ($LASTEXITCODE) { throw 'Android checks failed.' }
Get-Item -LiteralPath "$BuildDirectory\mobile\android\app\build\outputs\apk\debug\app-debug.apk" | Select-Object FullName,Length
