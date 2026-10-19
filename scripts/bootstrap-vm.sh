#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/install-ubuntu.sh" ]; then
  exec "$SCRIPT_DIR/install-ubuntu.sh" "$@"
fi

cd /mnt/Projetos/Academia/apps/api

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Edite o arquivo .env antes de continuar."
  exit 0
fi

npm install
npm run migrate
npm run start
