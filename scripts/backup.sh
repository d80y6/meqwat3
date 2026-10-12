#!/usr/bin/env bash
# Meqwat SaaS — PostgreSQL backup.
# Usage: DATABASE_URL=postgresql://... ./scripts/backup.sh [output-dir]
# Produces a compressed custom-format dump restorable with pg_restore.
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/meqwat-$STAMP.dump"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$FILE"
echo "✓ Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: keep the newest 14 backups.
ls -1t "$OUT_DIR"/meqwat-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "✓ Retention applied (14 newest kept in $OUT_DIR)"
