param([string]$BuildDirectory = "$env:LOCALAPPDATA\CodexPulse-build")
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Path $BuildDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('node_modules','release','dist','engine-dist','engine-build','.git','.venv314','__pycache__','.pytest_cache') } | Copy-Item -Destination $BuildDirectory -Recurse -Force
Push-Location $BuildDirectory
try {
    if (!(Test-Path -LiteralPath '.venv314\Scripts\python.exe')) { uv venv --python 3.14.5 .venv314; if ($LASTEXITCODE) { throw 'Python environment creation failed.' } }
    uv pip install --python .venv314\Scripts\python.exe -r engine\requirements.lock.txt
    if ($LASTEXITCODE) { throw 'Python dependency installation failed.' }
    npm ci --no-fund --no-audit
    if ($LASTEXITCODE) { throw 'Node dependency installation failed.' }
    npm test
    if ($LASTEXITCODE) { throw 'Desktop unit tests failed.' }
    & .venv314\Scripts\python.exe -m pytest -q engine
    if ($LASTEXITCODE) { throw 'Account engine tests failed.' }
    node tests\copilot-runtime.cjs
    if ($LASTEXITCODE) { throw 'Bundled Copilot runtime health check failed.' }
    node tests\backup-restart.cjs
    if ($LASTEXITCODE) { throw 'Encrypted backup cold-restart test failed.' }
    & .venv314\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --name pulse-engine --copy-metadata ccswap --collect-all truststore --distpath engine-dist --workpath engine-build engine\pulse_bridge.py
    if ($LASTEXITCODE) { throw 'Engine packaging failed.' }
    node tests\packaged-engine.cjs
    if ($LASTEXITCODE) { throw 'Frozen engine integration tests failed.' }
    npm audit
    if ($LASTEXITCODE) { throw 'Dependency audit failed.' }
    npm run package:win
    if ($LASTEXITCODE) { throw 'Desktop packaging failed.' }
    $smokeProcess = Start-Process -FilePath '.\release\win-unpacked\Codex Pulse.exe' -ArgumentList '--smoke' -WindowStyle Hidden -Wait -PassThru
    if ($smokeProcess.ExitCode -ne 0) { throw 'Packaged desktop smoke test failed.' }
    $env:PULSE_PYTHON = (Resolve-Path -LiteralPath '.venv314\Scripts\python.exe').Path
    node tests\desktop-lifecycle.cjs '.\release\win-unpacked\Codex Pulse.exe'
    if ($LASTEXITCODE) { throw 'Packaged account persistence/restart tests failed.' }
    Get-ChildItem -LiteralPath release -Filter '*.exe' | Select-Object FullName,Length
} finally { Pop-Location }
