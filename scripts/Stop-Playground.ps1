$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot 'native\runtime\server.pid.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'Kein durch das Startskript registrierter Server.'; exit 0 }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.processId)"
if (-not $process) { Write-Output 'Server ist bereits beendet.'; exit 0 }
$expected = Join-Path $projectRoot 'server.mjs'
if ($process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($expected)) { throw 'Die gespeicherte Prozessnummer gehört nicht zu diesem Playground. Es wurde nichts beendet.' }
Stop-Process -Id ([int]$record.processId)
Write-Output 'Engine-Playground-Server beendet.'
