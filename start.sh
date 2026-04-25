#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/backend"
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Backend iniciado (PID: $BACKEND_PID) en http://localhost:8000"

cd "$ROOT_DIR/frontend"
npm run dev
