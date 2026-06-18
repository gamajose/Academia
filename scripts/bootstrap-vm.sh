#!/usr/bin/env bash
set -e

cd /mnt/Projetos/Academia/apps/api

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Edite o arquivo .env antes de continuar."
  exit 0
fi

npm install
npm run migrate
npm run start
