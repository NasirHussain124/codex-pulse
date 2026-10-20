param([string]$ToolsDirectory = "$env:LOCALAPPDATA\CodexPulse-android-tools")
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $ToolsDirectory -Force | Out-Null
function Get-VerifiedArchive($Url, $Output, $Hash, $Algorithm = 'SHA256') {
    if (!(Test-Path -LiteralPath $Output)) { Invoke-WebRequest -Uri $Url -OutFile $Output }
    if ((Get-FileHash -LiteralPath $Output -Algorithm $Algorithm).Hash -ne $Hash) { throw "Download checksum mismatch: $Output" }
}
$jdk = (Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows')[0].binary.package
Get-VerifiedArchive $jdk.link "$ToolsDirectory\jdk.zip" $jdk.checksum
if (!(Test-Path -LiteralPath "$ToolsDirectory\jdk")) { Expand-Archive -LiteralPath "$ToolsDirectory\jdk.zip" -DestinationPath "$ToolsDirectory\jdk" }
$javaDirectory = (Get-ChildItem -LiteralPath "$ToolsDirectory\jdk" -Directory | Select-Object -First 1).FullName
$checksumResponse = (Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-8.13-bin.zip.sha256').Content
$gradleChecksum = if ($checksumResponse -is [byte[]]) { [Text.Encoding]::UTF8.GetString($checksumResponse).Trim() } else { $checksumResponse.Trim() }
Get-VerifiedArchive 'https://services.gradle.org/distributions/gradle-8.13-bin.zip' "$ToolsDirectory\gradle.zip" $gradleChecksum
if (!(Test-Path -LiteralPath "$ToolsDirectory\gradle-8.13")) { Expand-Archive -LiteralPath "$ToolsDirectory\gradle.zip" -DestinationPath $ToolsDirectory }
[xml]$repository = (Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml').Content
$archives = $repository.SelectNodes("//*[local-name()='remotePackage' and @path='cmdline-tools;19.0']/*[local-name()='archives']/*[local-name()='archive']")
$archive = $archives | Where-Object { $_.'host-os' -eq 'windows' } | Select-Object -First 1
if (!$archive) { throw 'Official Android command-line tools metadata unavailable.' }
Get-VerifiedArchive ('https://dl.google.com/android/repository/' + $archive.complete.url) "$ToolsDirectory\sdk-tools-19.zip" ([string]$archive.complete.checksum) 'SHA1'
$sdkDirectory = "$ToolsDirectory\sdk"
if (!(Test-Path -LiteralPath "$sdkDirectory\cmdline-tools\19.0\bin\sdkmanager.bat")) {
    Expand-Archive -LiteralPath "$ToolsDirectory\sdk-tools-19.zip" -DestinationPath "$ToolsDirectory\sdk-extracted-19" -Force
    New-Item -ItemType Directory -Path "$sdkDirectory\cmdline-tools\19.0" -Force | Out-Null
    Get-ChildItem -LiteralPath "$ToolsDirectory\sdk-extracted-19\cmdline-tools" -Force | Copy-Item -Destination "$sdkDirectory\cmdline-tools\19.0" -Recurse -Force
}
$env:JAVA_HOME = $javaDirectory
$env:ANDROID_HOME = $sdkDirectory
$sdkManager = "$sdkDirectory\cmdline-tools\19.0\bin\sdkmanager.bat"
# Standard SDK licenses are required for this requested local Android build.
1..80 | ForEach-Object { 'y' } | & $sdkManager --sdk_root=$sdkDirectory --licenses
if ($LASTEXITCODE) { throw 'Android SDK license setup failed.' }
& $sdkManager --sdk_root=$sdkDirectory 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
if ($LASTEXITCODE) { throw 'Android SDK installation failed.' }
Write-Output "JAVA_HOME=$javaDirectory"
Write-Output "ANDROID_HOME=$sdkDirectory"
Write-Output "Gradle=$ToolsDirectory\gradle-8.13\bin\gradle.bat"
