$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location (Join-Path $root 'conversion-engines/python')
py -3 -m venv .venv
$python = Join-Path (Get-Location) '.venv/Scripts/python.exe'
& $python -m pip install --upgrade pip
& $python -m pip install -r requirements.txt
& $python -m PyInstaller --noconfirm --clean --onedir --name format-worker worker.py
