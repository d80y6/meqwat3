# Changed-file inventory — 2026-10-15

Compared with starting commit `c00501ff025543174ae3fbb64ead8edb1e51515e`, on `arena/6b6973be-meqwat3`. Working-tree changes are saved; no push/deployment is claimed. Ignored local DB/tooling/logs, node_modules and test traces are not deliverables.

## Migration set (fresh + repeat verified)

- `db/migrations/0000_initial.sql`: reproducible original schema foundation.
- `0001_audit_integrity.sql`: adds preserved purchase-item returned quantities.
- `0002_rls.sql`: transaction-context tenant policies.
- `0003_constraints.sql`: tenant composite relationships, checks and posted-row protection.
- `0004_owner_maintenance.sql`: explicit owner maintenance path.
- `0005_recovery_and_rate_limits.sql`: reset-token and shared rate-limit tables.
- `0006_initial_password.sql`: must-change-password flag.

Runner: `scripts/migrate.ts` (locked transaction, checksum history). Existing-schema adoption is operator-reviewed, not automatically certified. Do not run schema push to replace these migrations.

## Modified tracked files

- `.env.example`
- `.github/workflows/ci.yml`
- `.gitignore`
- `Dockerfile`
- `README.md`
- `db/rls.sql`
- `docker-compose.yml`
- `docs/DECISIONS.md`
- `drizzle.config.ts`
- `eslint.config.mjs`
- `mobile/README.md`
- `mobile/lib/core/api/api_client.dart`
- `mobile/lib/core/database/app_database.dart`
- `mobile/lib/core/sync/sync_repository.dart`
- `mobile/lib/features/auth/data/auth_repository.dart`
- `mobile/lib/features/pos/data/pos_repository.dart`
- `mobile/lib/main.dart`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `render.yaml`
- `scripts/backup.sh`
- `scripts/restore.sh`
- `scripts/verify-rls.sh`
- `src/app/(app)/admin/page.tsx`
- `src/app/(app)/audit/page.tsx`
- `src/app/(app)/cash/page.tsx`
- `src/app/(app)/customers/page.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/debts/page.tsx`
- `src/app/(app)/inventory/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/pos/page.tsx`
- `src/app/(app)/products/page.tsx`
- `src/app/(app)/purchases/page.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/sales/page.tsx`
- `src/app/(app)/subscription/page.tsx`
- `src/app/(app)/suppliers/page.tsx`
- `src/app/(app)/users/page.tsx`
- `src/app/api/admin/subscription-requests/route.ts`
- `src/app/api/admin/tenants/[id]/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/refresh/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/expenses/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/inventory/route.ts`
- `src/app/api/metrics/route.ts`
- `src/app/api/payments/route.ts`
- `src/app/api/products/[id]/route.ts`
- `src/app/api/purchases/[id]/return/route.ts`
- `src/app/api/purchases/route.ts`
- `src/app/api/registers/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/api/sales/[id]/return/route.ts`
- `src/app/api/sales/route.ts`
- `src/app/api/shifts/route.ts`
- `src/app/api/subscription-requests/route.ts`
- `src/app/api/suppliers/[id]/route.ts`
- `src/app/api/suppliers/route.ts`
- `src/app/api/sync/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/users/route.ts`
- `src/app/login/page.tsx`
- `src/components/Receipt.tsx`
- `src/components/Shell.tsx`
- `src/db/bootstrap.ts`
- `src/db/index.ts`
- `src/db/schema.ts`
- `src/db/seed.ts`
- `src/lib/api.ts`
- `src/lib/auth.ts`
- `src/lib/client.ts`
- `src/lib/mail.ts`
- `src/lib/money.ts`
- `src/lib/offline.ts`
- `src/lib/provision.ts`
- `src/lib/rate-limit.ts`
- `src/lib/services.ts`
- `src/middleware.ts`
- `tests/e2e/journey.spec.ts`
- `tests/integration.test.ts`
- `tests/money.test.ts`
- `tests/rls.test.ts`
- `tsconfig.json`
- `vitest.config.ts`

## Added files

- `.dockerignore`
- `db/migrations/0000_initial.sql`
- `db/migrations/0001_audit_integrity.sql`
- `db/migrations/0002_rls.sql`
- `db/migrations/0003_constraints.sql`
- `db/migrations/0004_owner_maintenance.sql`
- `db/migrations/0005_recovery_and_rate_limits.sql`
- `db/migrations/0006_initial_password.sql`
- `db/migrations/meta/0000_snapshot.json`
- `db/migrations/meta/0001_snapshot.json`
- `db/migrations/meta/0002_snapshot.json`
- `db/migrations/meta/_journal.json`
- `docs/audit/BASELINE.md`
- `docs/audit/CHANGED-FILES.md`
- `docs/audit/FINDINGS.md`
- `docs/audit/OPERATIONS.md`
- `docs/audit/PRODUCTION-READINESS.md`
- `docs/audit/REMEDIATION-LOG.md`
- `docs/audit/TEST-RESULTS.md`
- `docs/audit/screenshots/dashboard-desktop.png`
- `docs/audit/screenshots/pos-tablet.png`
- `docs/audit/screenshots/reports-mobile.png`
- `e2e/audit-api.spec.ts`
- `e2e/audit-offline-responsive.spec.ts`
- `scripts/migrate.ts`
- `scripts/start.mjs`
- `scripts/test-role.ts`
- `src/app/api/auth/change-password/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/change-password/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/db/context.ts`
- `src/instrumentation.ts`
- `src/lib/business-date.ts`
- `src/lib/csrf.ts`
- `src/lib/money-draft.ts`
- `src/lib/password-reset.ts`
- `tests/postgres-rate-limit.test.ts`
- `tests/security-rules.test.ts`
- `tests/test-database-safety.ts`

Inventory: **90 modified tracked files; 42 added files** at this checkpoint.
