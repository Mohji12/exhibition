#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/exhibition}"
BACKEND_DIR="$APP_DIR/backend"
VENV_DIR="$BACKEND_DIR/exhibition"
SERVICE_NAME="${SERVICE_NAME:-exhibition}"

cd "$BACKEND_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
pip install -r requirements.txt

if [[ ! -f .env ]]; then
  echo "Missing $BACKEND_DIR/.env — copy from .env.example and fill secrets before starting."
  exit 1
fi

if [[ -f "$BACKEND_DIR/deploy/exhibition-api.service" ]]; then
  sudo cp "$BACKEND_DIR/deploy/exhibition-api.service" "/etc/systemd/system/${SERVICE_NAME}.service"
  sudo systemctl daemon-reload
  sudo systemctl enable "${SERVICE_NAME}.service"
fi
sudo systemctl restart "${SERVICE_NAME}.service"

# Bootstrap (schema migration) can take several seconds after restart.
ok=0
for _ in $(seq 1 20); do
  sleep 2
  if curl -fsS "http://127.0.0.1:8002/health" >/dev/null; then
    ok=1
    break
  fi
done
if [[ "$ok" -eq 1 ]]; then
  echo "Health check OK on :8002"
else
  echo "Service started but /health failed. Check: sudo journalctl -u ${SERVICE_NAME} -n 80 --no-pager"
  exit 1
fi
