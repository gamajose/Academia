#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/mnt/backups/academia}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DATABASE_URL="${DATABASE_URL:-}"

mkdir -p "$BACKUP_DIR"
NOW="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/academia-$NOW.sql.gz"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL nao definido. Exporte DATABASE_URL antes de executar."
  exit 1
fi

pg_dump "$DATABASE_URL" | gzip > "$OUT"
find "$BACKUP_DIR" -type f -name 'academia-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup gerado: $OUT"
