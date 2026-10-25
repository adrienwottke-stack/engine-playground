param([string]$ExePath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = Join-Path $projectRoot 'native\source'
if (-not $ExePath) { $ExePath = Join-Path $sourceRoot 'build\Release\engine-sim-app.exe' }
if (-not (Test-Path -LiteralPath $ExePath)) { throw 'Kein nativer Build vorhanden. Zuerst Build-Native.ps1 ausführen. Start-Playground.cmd startet bereits die spielbare Demo.' }
$exeFull = [IO.Path]::GetFullPath($ExePath)
$mailboxRoot = Join-Path $projectRoot 'native\runtime\mailbox'
New-Item -ItemType Directory -Force -Path $mailboxRoot | Out-Null
$engineAssets = Join-Path $sourceRoot 'dependencies\submodules\delta-studio\engines\basic'
$assetsRoot = Join-Path $sourceRoot 'assets'
# The engine resolves these two paths relative to the binary; absolute paths work as well.
@($engineAssets, $assetsRoot) | Set-Content -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($exeFull)) 'delta.conf') -Encoding ASCII
$previousMailbox = $env:ENGINE_PLAYGROUND_MAILBOX
try {
    $env:ENGINE_PLAYGROUND_MAILBOX = $mailboxRoot
    Start-Process -FilePath $exeFull -WorkingDirectory $sourceRoot -WindowStyle Normal | Out-Null
} finally { $env:ENGINE_PLAYGROUND_MAILBOX = $previousMailbox }
Write-Output 'Native Anwendung gestartet. Im Playground „Native Bridge“ wählen. Verbunden erscheint erst nach frischer Telemetrie.'
