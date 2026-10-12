#!/usr/bin/env bash
# Meqwat SaaS — verify Row-Level Security actually binds under the
# restricted application role (superusers bypass RLS by design).
#
# Usage:
#   ADMIN_DB_URL=postgresql://postgres:...@host/db ./scripts/verify-rls.sh
#
# The script (idempotently) creates role `meqwat_app`, grants table
# privileges, applies db/rls.sql, then connects AS meqwat_app and asserts:
#   1. tenant context A sees only tenant A's products
#   2. no context (no GUC) sees zero tenant rows
#   3. inserting a row for tenant B while in context A is rejected
#   4. admin context (app.is_admin=true) sees all rows
# Exit code 0 = all assertions passed.
set -euo pipefail

ADMIN_DB_URL="${ADMIN_DB_URL:-${DATABASE_URL:-}}"
APP_PASSWORD="${MEQWAT_APP_PASSWORD:-meqwat_app_dev_password}"
if [ -z "$ADMIN_DB_URL" ]; then echo "Set ADMIN_DB_URL (superuser connection)"; exit 1; fi

APP_DB_URL="$(echo "$ADMIN_DB_URL" | sed -E "s#://[^@]+@#://meqwat_app:${APP_PASSWORD}@#")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Creating role + grants (idempotent)"
psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meqwat_app') THEN
    CREATE ROLE meqwat_app LOGIN PASSWORD '${APP_PASSWORD}';
  END IF;
END \$\$;
GRANT USAGE ON SCHEMA public TO meqwat_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO meqwat_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO meqwat_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meqwat_app;
SQL

echo "→ Applying db/rls.sql"
psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/db/rls.sql" > /dev/null

fail() { echo "✗ RLS VERIFICATION FAILED: $1"; exit 1; }

TENANT_A="$(psql "$ADMIN_DB_URL" -tA -c "select id from tenants order by created_at limit 1")"
TENANT_B="$(psql "$ADMIN_DB_URL" -tA -c "select id from tenants where id <> '${TENANT_A}' order by created_at limit 1")"
[ -n "$TENANT_A" ] && [ -n "$TENANT_B" ] || fail "need at least two tenants in the database (run the seed)"
TOTAL_PRODUCTS="$(psql "$ADMIN_DB_URL" -tA -c "select count(*) from products;")"

# Run SQL as the app role in ONE session (GUCs are transaction-local) and
# pick the line carrying our label. Temp file avoids heredoc-in-function issues.
probe() {
  local tmp
  tmp="$(mktemp)"
  {
    echo "begin;"
    echo "select set_config('app.tenant_id','${TENANT_A}',true);"
    echo "$1"
    echo "commit;"
  } > "$tmp"
  local out
  out="$(psql "$APP_DB_URL" -tA -f "$tmp" 2>/dev/null | sed -n 's/^PROBE|//p')"
  rm -f "$tmp"
  echo "$out"
}

echo "→ [1] tenant context sees only its own rows"
OUT="$(probe "select 'PROBE|' || count(*) from products where tenant_id='${TENANT_B}';")"
[ "$OUT" = "0" ] || fail "tenant A could see tenant B products (saw: $OUT)"
OWN="$(probe "select 'PROBE|' || count(*) from products;")"
echo "   tenant A sees $OWN own products, 0 of tenant B ✓"

echo "→ [2] no tenant context sees nothing"
SEEN_NONE="$(psql "$APP_DB_URL" -tA -c "select count(*) from products;")"
[ "$SEEN_NONE" = "0" ] || fail "rows leaked without tenant context ($SEEN_NONE)"
echo "   rows without context: 0 ✓"

echo "→ [3] cross-tenant INSERT is rejected by WITH CHECK"
if psql "$APP_DB_URL" -v ON_ERROR_STOP=1 -tA -c "begin; select set_config('app.tenant_id','${TENANT_A}',true); insert into products (tenant_id, name) values ('${TENANT_B}', 'rls-probe'); commit;" > /dev/null 2>&1; then
  fail "cross-tenant insert was allowed"
fi
echo "   rejected ✓"

echo "→ [4] admin context sees everything"
TMP_ADMIN="$(mktemp)"
{
  echo "begin;"
  echo "select set_config('app.is_admin','true',true);"
  echo "select 'PROBE|' || count(*) from products;"
  echo "commit;"
} > "$TMP_ADMIN"
SEEN_ADMIN="$(psql "$APP_DB_URL" -tA -f "$TMP_ADMIN" 2>/dev/null | sed -n 's/^PROBE|//p')"
rm -f "$TMP_ADMIN"
[ "$SEEN_ADMIN" = "$TOTAL_PRODUCTS" ] || fail "admin saw $SEEN_ADMIN of $TOTAL_PRODUCTS products"
echo "   admin products visible: $SEEN_ADMIN / $TOTAL_PRODUCTS ✓"

echo "✓ RLS VERIFICATION PASSED — policies bind under role meqwat_app"
