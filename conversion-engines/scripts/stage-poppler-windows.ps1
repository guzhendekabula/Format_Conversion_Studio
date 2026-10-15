$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$version = '26.09.0-0'
$sha256 = '7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0'
$archive = Join-Path $env:TEMP "poppler-$version.zip"
$extract = Join-Path $env:TEMP "poppler-$version"
$stage = Join-Path $root 'conversion-engines/poppler/dist/win32'
Invoke-WebRequest "https://github.com/oschwartz10612/poppler-windows/releases/download/v$version/Release-$version.zip" -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) { throw 'Poppler archive SHA-256 mismatch' }
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive $archive -DestinationPath $extract
$library = Get-ChildItem $extract -Directory -Recurse | Where-Object { $_.Name -eq 'Library' } | Select-Object -First 1
if (-not $library) { throw 'Poppler archive does not contain Library directory' }
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $library.FullName 'bin/*') $stage -Recurse
if (Test-Path (Join-Path $library.FullName 'share/poppler')) { Copy-Item (Join-Path $library.FullName 'share/poppler') (Join-Path $stage 'share-poppler') -Recurse }
