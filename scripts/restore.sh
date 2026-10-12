#!/usr/bin/env bash
# Meqwat SaaS — restore a backup produced by scripts/backup.sh.
# Usage: DATABASE_URL=postgresql://... ./scripts/restore.sh backups/meqwat-YYYYMMDD-HHMMSS.dump
# WARNING: --clean drops existing objects in the target database first.
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <backup-file.dump>" >&2
  exit 1
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

read -r -p "This will REPLACE data in the target database. Type RESTORE to continue: " CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

pg_restore "$DATABASE_URL" --clean --if-exists --no-owner "$FILE"
echo "✓ Restore complete from $FILE"
echo "Verify: curl http://localhost:3000/api/health"
