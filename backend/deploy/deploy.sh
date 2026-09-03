#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/conninter-exhibition}"
BACKEND_DIR="$APP_DIR/backend"
SERVICE_NAME="exhibition-api"

mkdir -p "$BACKEND_DIR"
cd "$BACKEND_DIR"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created $BACKEND_DIR/.env from example. Fill DATABASE_* / AUTH_SECRET / GEMINI_API_KEY, then rerun deploy."
  exit 1
fi

if [[ -f "$APP_DIR/backend/deploy/exhibition-api.service" ]]; then
  sudo cp "$APP_DIR/backend/deploy/exhibition-api.service" "/etc/systemd/system/${SERVICE_NAME}.service"
  sudo systemctl daemon-reload
  sudo systemctl enable "${SERVICE_NAME}.service"
  sudo systemctl restart "${SERVICE_NAME}.service"
fi

sleep 2
if curl -fsS "http://127.0.0.1:8000/health" >/dev/null; then
  echo "Health check OK"
else
  echo "Service started but /health failed. Check: sudo journalctl -u ${SERVICE_NAME} -n 80 --no-pager"
  exit 1
fi
