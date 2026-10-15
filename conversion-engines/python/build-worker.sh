#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/conversion-engines/python"
python3 -m venv .venv
PYTHON="$ROOT/conversion-engines/python/.venv/bin/python"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r requirements.txt
"$PYTHON" -m PyInstaller --noconfirm --clean --onedir --name format-worker worker.py
mkdir -p dist
if [ "$(uname -s)" = "Darwin" ]; then
  chmod +x dist/format-worker/format-worker
fi
