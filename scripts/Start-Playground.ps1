param([ValidateRange(1024,65535)][int]$Port = 4196, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 22.12 oder neuer installieren. Node wurde nicht gefunden.' }
$nodeVersion = & $nodeCommand.Source --version
if ([version]($nodeVersion.TrimStart('v')) -lt [version]'22.12') { throw 'Node.js 22.12 oder neuer ist erforderlich.' }
$projectUrl = "http://127.0.0.1:$Port"
$running = $false
$differentPlayground = $false
try { $health = Invoke-RestMethod -Uri "$projectUrl/api/health" -TimeoutSec 2; $running = $health.app -eq 'engine-playground' -and $health.variant -eq 'motor-workshop'; $differentPlayground = $health.app -eq 'engine-playground' -and -not $running } catch { }
if ($differentPlayground) { throw "Auf Port $Port laeuft ein anderer Playground. Bitte einen freien Port waehlen." }
if (-not $running) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
        Push-Location -LiteralPath $projectRoot
        try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Abhängigkeiten konnten nicht geladen werden.' }; & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Browser-Build fehlgeschlagen.' } } finally { Pop-Location }
    }
    $runtimeRoot = Join-Path $projectRoot 'native\runtime'
    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    $serverFile = Join-Path $projectRoot 'server.mjs'
    $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList @(('"' + $serverFile + '"'), '--port', "$Port") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'server.stdout.log') -RedirectStandardError (Join-Path $runtimeRoot 'server.stderr.log') -PassThru
    @{ processId = $process.Id; port = $Port; serverFile = $serverFile } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'server.pid.json') -Encoding UTF8
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 150
        try { $health = Invoke-RestMethod -Uri "$projectUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'engine-playground' -and $health.variant -eq 'motor-workshop') { $running = $true; break } } catch { }
        $process.Refresh(); if ($process.HasExited) { break }
    }
    if (-not $running) { throw "Start fehlgeschlagen. Prüfe native/runtime/server.stderr.log oder nutze einen freien Port mit -Port 4174." }
}
Write-Output "Engine Playground läuft: $projectUrl"
Write-Output '3D-Motorwerkstatt bereit. Ton nach Klick auf Motor starten.'
if (-not $NoBrowser) { Start-Process $projectUrl }
