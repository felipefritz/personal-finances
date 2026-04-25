#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Configurando backend"
cd "$ROOT_DIR/backend"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
if [[ ! -f ".env" ]]; then
  cp .env.example .env
fi
deactivate

echo "==> Configurando frontend"
cd "$ROOT_DIR/frontend"
npm install

echo "Instalacion completada"
