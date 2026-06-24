#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/mnt/Projetos/Academia}
SERVICE_NAME=${SERVICE_NAME:-academia-api}
WEB_SERVICE_NAME=${WEB_SERVICE_NAME:-academia-web}
WEB_PORT=${WEB_PORT:-8084}

cd "$APP_DIR"
git pull

cd "$APP_DIR/apps/api"
npm install
npm run migrate

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl restart "$WEB_SERVICE_NAME" || true
  sudo systemctl status "$SERVICE_NAME" --no-pager || true
  sudo systemctl status "$WEB_SERVICE_NAME" --no-pager || true
else
  echo "systemctl nao encontrado. Inicie a API manualmente com npm run start."
fi

curl -fsS http://localhost:3004/health

echo "Deploy concluido. Web: http://IP_DA_VM:${WEB_PORT}/"
