$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = Join-Path $projectRoot 'native\source'
if (Test-Path -LiteralPath (Join-Path $sourceRoot 'README.md')) { Write-Output 'Vorbereiteter Quellcode ist bereits vorhanden. Es wird nichts ersetzt.'; exit 0 }
$upstreamRoot = Join-Path $projectRoot 'work\native-upstream'
if (Test-Path -LiteralPath $upstreamRoot) { throw 'work/native-upstream ist bereits vorhanden. Prüfe diesen Ordner, bevor du erneut herunterlädst.' }
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'work') | Out-Null
& git clone --no-checkout https://github.com/ange-yaghi/engine-sim.git $upstreamRoot
if ($LASTEXITCODE -ne 0) { throw 'Download des Originalcodes fehlgeschlagen.' }
& git -C $upstreamRoot checkout --detach 85f7c3b959a908ed5232ede4f1a4ac7eafe6b630
if ($LASTEXITCODE -ne 0) { throw 'Der geprüfte Quellstand konnte nicht ausgecheckt werden.' }
& git -C $upstreamRoot submodule update --init --recursive
if ($LASTEXITCODE -ne 0) { throw 'Submodule konnten nicht vollständig geladen werden.' }
& node (Join-Path $PSScriptRoot 'patch-native.mjs') $upstreamRoot
if ($LASTEXITCODE -ne 0) { throw 'Native Erweiterung konnte nicht angewendet werden.' }
Write-Output 'Originalcode und Submodule geladen, Erweiterung eingearbeitet. Build noch nicht ausgeführt.'
