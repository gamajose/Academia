#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/software"
python3 -m pip install --user pyinstaller
python3 -m PyInstaller --onefile --windowed --name AcademiaCheckin academia_checkin.py

echo "Executavel gerado em apps/software/dist/AcademiaCheckin"
