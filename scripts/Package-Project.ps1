$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$archiveFile = Join-Path $outputRoot ('Engine-Playground-v' + $version + '.zip')
if (Test-Path -LiteralPath $archiveFile) { throw 'Das Lieferpaket existiert bereits. Es wird nicht ungefragt überschrieben.' }
$files = [Collections.Generic.List[IO.FileInfo]]::new()
$rootFiles = @('README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','server.mjs','Start-Playground.cmd','Stop-Playground.cmd','.gitignore')
foreach ($name in $rootFiles) { $files.Add((Get-Item -LiteralPath (Join-Path $projectRoot $name))) }
foreach ($folder in @('src','public','dist','scripts','docs','tests','examples','evidence')) { foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse)) { $files.Add($file) } }
foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $projectRoot 'native') -File)) { $files.Add($file) }
$headlessRoot = Join-Path $projectRoot 'native\headless'
foreach ($file in (Get-ChildItem -LiteralPath $headlessRoot -File -Recurse)) {
    $headlessRelative = $file.FullName.Substring($headlessRoot.Length + 1).Replace('\','/')
    if ($headlessRelative.StartsWith('obj/') -or $headlessRelative.StartsWith('runtime/') -or $headlessRelative -eq 'objects.rsp' -or $headlessRelative -eq 'assets/runtime_i6.mr') { continue }
    if ($headlessRelative.StartsWith('bin/') -and $headlessRelative -ne 'bin/engine-core.exe') { continue }
    $files.Add($file)
}
$stream = [IO.File]::Open($archiveFile,[IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
        $entry = $archive.CreateEntry(('engine-playground/' + $relative),[IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        if ($relative -eq 'native/headless/assets/main.mr') {
            $canonicalMain = 'import "engine_sim.mr"' + "`n" + 'import "engines/playground/m52_reference.mr"' + "`nmain()`n"
            $canonicalBytes = [Text.Encoding]::UTF8.GetBytes($canonicalMain)
            try { $entryStream.Write($canonicalBytes,0,$canonicalBytes.Length) } finally { $entryStream.Dispose() }
            continue
        }
        $fileStream = [IO.File]::OpenRead($file.FullName)
        try { $fileStream.CopyTo($entryStream) } finally { $fileStream.Dispose(); $entryStream.Dispose() }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output $archiveFile
Write-Output 'Das Paket enthält Browser-Build, lauffähigen physischen Kern, native Quellen, Motordaten, Impulsantworten, Hinweise, Beispiele und Prüfbelege. Toolchain und großer Originaldownload sind separat.'
