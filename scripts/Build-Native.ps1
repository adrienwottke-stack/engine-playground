param([switch]$CheckOnly, [string]$DependencyRoot = '', [string]$FlexPath = '', [string]$BisonPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = Join-Path $projectRoot 'native\source'
$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsCpp = if (Test-Path -LiteralPath $vswherePath) { & $vswherePath -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath } else { '' }
$cmakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include'
$checks = [ordered]@{
    sourcePresent = (Test-Path -LiteralPath (Join-Path $sourceRoot 'src\playground_bridge.cpp'))
    cppToolchainPresent = [bool]$vsCpp
    visualStudioCppPath = if ($vsCpp) { "$vsCpp" } else { $null }
    cmakePresent = [bool]$cmakeCommand
    windows10Or11SdkPresent = (Test-Path -LiteralPath $sdkRoot)
    dependencyRootProvided = [bool]$DependencyRoot
    requiredExternalDependencies = @('SDL2', 'SDL2_image', 'Boost.Filesystem', 'Flex', 'Bison')
    compiled = $false
}
$checks | ConvertTo-Json
if ($CheckOnly) { exit 0 }
if (-not $checks.cppToolchainPresent -or -not $checks.cmakePresent -or -not $checks.windows10Or11SdkPresent) { throw 'Native Build blockiert: C++-Desktopentwicklung mit MSVC, Windows-SDK und CMake installieren. Der Demo-Modus funktioniert unabhängig davon.' }
if (-not $DependencyRoot) { throw 'DependencyRoot mit SDL2, SDL2_image und Boost.Filesystem angeben; Flex/Bison müssen erreichbar sein. Sie sind im Drittanbieter-Original nicht vollständig gebündelt.' }
$buildRoot = Join-Path $sourceRoot 'build'
$cmakeArgs = @('-S', $sourceRoot, '-B', $buildRoot, '-G', 'Visual Studio 17 2022', '-A', 'x64', '-DDISCORD_ENABLED=OFF', '-DDTV=OFF', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5', "-DCMAKE_PREFIX_PATH=$DependencyRoot")
if ($FlexPath) { $cmakeArgs += "-DFLEX_EXECUTABLE=$FlexPath" }
if ($BisonPath) { $cmakeArgs += "-DBISON_EXECUTABLE=$BisonPath" }
& $cmakeCommand.Source @cmakeArgs
if ($LASTEXITCODE -ne 0) { throw 'CMake-Konfiguration fehlgeschlagen. Abhängigkeiten und Buildprotokoll prüfen.' }
& $cmakeCommand.Source --build $buildRoot --config Release --target engine-sim-app --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Nativer Build fehlgeschlagen.' }
Write-Output 'Nativer Build erstellt. Anschließend Start-Native.ps1 ausführen und die echte Verbindung prüfen.'
