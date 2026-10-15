#!/usr/bin/env bash
# Owner/backup-role URL required. Local retention is not off-site recovery.
set -euo pipefail
umask 077
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/meqwat-$STAMP-$$.dump"
PARTIAL="$(mktemp "$OUT_DIR/.meqwat-backup.XXXXXX")"
trap 'rm -f -- "$PARTIAL"' EXIT
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$PARTIAL"
mv -- "$PARTIAL" "$FILE"
echo "Backup completed; verify an isolated restore before relying on it."
# Generated names sort chronologically; array expansion preserves spaced paths.
shopt -s nullglob
files=("$OUT_DIR"/meqwat-*.dump)
if (( ${#files[@]} > 14 )); then rm -f -- "${files[@]:0:${#files[@]}-14}"; fi
