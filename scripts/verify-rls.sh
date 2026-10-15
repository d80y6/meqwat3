#!/usr/bin/env bash
# Run ONLY on an isolated local *test* database. Does not provision roles,
# alter policies, infer credentials, or insert probes into production tenants.
set -euo pipefail
: "${DATABASE_URL:?Set schema-owner URL for a disposable local test database}"
: "${RLS_TEST_DATABASE_URL:?Set restricted test-role URL}"
cd "$(dirname "$0")/.."
npx vitest run tests/rls.test.ts
