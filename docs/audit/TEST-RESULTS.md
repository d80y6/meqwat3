# Executed verification — final checkpoint, 2026-10-15

**No production database, infrastructure, mail account or credentials were used.** PASS means executed evidence, not inspection. Local PostgreSQL was a native 16.4 server, not a mock. Application HTTP/browser tests used the restricted `meqwat_app` role; owner connections were used only for isolated fixture setup, migrations and independent assertions.

## Baseline → final

| Check | Baseline | Final executed result |
|---|---|---|
| Dependency installation | `npm ci` PASS; 12 advisories | Fresh `npm ci` PASS |
| TypeScript | PASS | **PASS**, exit 0 |
| ESLint | **FAIL**, 45 errors | **PASS**, exit 0, 0 errors / 1 intentional hard-navigation warning |
| Vitest without DB | 12 PASS / 11 SKIP | Not used as persistence evidence |
| Real-DB / unit suite | Original financial suite 7 PASS; original RLS 3 PASS / 1 FAIL | **56/56 PASS**, 7 files, zero skips |
| Production build | PASS | **PASS**, Next.js 16.4.0 |
| Real HTTP / Chromium | Initially blocked by missing libnspr4 | **27/27 PASS**, 45.5s, latest built application |
| Production dependency audit | Vulnerable baseline | **PASS**, `npm audit --omit=dev`: 0 vulnerabilities |
| Full dependency audit | **FAIL**, 1 critical / 7 high / 4 moderate | **FAIL**, exit 1: 5 high, development-only chain; 0 critical |
| Fresh migrations | No versioned execution history | **PASS**, empty `meqwat_bootstrap_test`: 0000–0006; repeat no-op |
| Production-mode bootstrap | Not proved | **PASS**, twice on isolated fresh DB: exactly 3 plans, 1 admin, 0 tenants, 7 migrations |
| Startup safeguards | Owner-role exposure / insufficient preflight | **PASS**, missing secret and owner role exit 1; restricted role starts and serves tests |
| Persistence across DB + app restarts | Not proved | **PASS**, exact SHA-256 fingerprints of 14 business tables unchanged; 14 committed sales retained |
| Actual database outage | Not proved | **PASS**, health 503 sanitized, login 500 sanitized; recovery health 200 |
| Shell scripts | Unproved | **PASS**, `bash -n` for backup/restore/RLS scripts; not execution of dump/restore |
| Docker / Render / hosted CI | Unproved | **BLOCKED / NOT TESTED**, no executed deployment or hosted workflow |
| SMTP delivery | Unproved | **BLOCKED**; only safe not-configured behavior and local reset lifecycle tested |
| Flutter / devices | Unproved | **BLOCKED**, Flutter/Dart absent; no compile/device claims |
| Actual backup/restore | Unproved | **BLOCKED**, pg_dump/pg_restore absent |

The final production build preceded only additional browser-test code, CI configuration, documentation and a bootstrap comment change; no runtime application changes occurred after the passing 27-test run.

## Test inventory

`npm test`: **56 tests / 7 files**, no skips:
- `tests/integration.test.ts`: **20** real-PostgreSQL financial/auth tests.
- `tests/rls.test.ts`: **5** actual restricted-role SQL tests.
- `tests/security-rules.test.ts`: **17** boundary/security tests.
- `tests/money.test.ts`: **8** exact decimal, permissions and draft parsing tests.
- `tests/rate-limit.test.ts`: **4** limiter unit tests.
- `tests/postgres-rate-limit.test.ts`: **1** concurrent shared-store PostgreSQL test.
- `tests/email.test.ts`: **1** SMTP-not-configured behavior test, **not** delivery proof.

`npx playwright test`: **27** tests, one Chromium worker:
- `e2e/audit-api.spec.ts`: **10** adversarial real HTTP/PostgreSQL tests.
- `e2e/audit-offline-responsive.spec.ts`: **5** lost-response/reload and responsive tests.
- `e2e/smoke.spec.ts`: **5** public/auth/health checks.
- `tests/e2e/journey.spec.ts`: **7** public, owner, cashier and platform-admin journeys.

## Proven security/isolation behavior

- Anonymous private collection access: 401; metrics not public.
- Distinct tenants cannot read/modify the other's customer/product or post foreign references; 404/denial verified with HTTP and SQL.
- Cashier cannot gain purchase/payment/stock permissions through sync; foreign queue identity returns 403.
- Direct restricted SQL: no-context denial, isolated tenant rows, cross-tenant composite FK rejected with SQLSTATE 23503; posted sale update/delete denied.
- Cross-origin mutation rejected 403 even with forged `Sec-Fetch-Site: same-site`.
- Live role changes and disabled users apply before access JWT expiry.
- Refresh race: one 200, one 401; copied access cookie denied after logout.
- Concurrent subscription approval: one 200, one 400, only one provisioning effect. Initial owner is blocked from products until password change; change revokes old session; new login works. Renewal retains tenant and does not create another temporary password.
- Password reset token stored hashed, single-use consumption, session revocation: real DB test. SMTP/inbox flow not run.

## Proven financial/atomicity behavior

- Strict money/quantity precision/range; bigint allocation intermediates; negative cost and duplicate purchase line rejection.
- Same mutation key concurrent HTTP sale: one 201 + four 200; same key/different payload 409; one stock/debt posting.
- Independent distinct-key final-unit sales: one success, one rejection, stock exactly zero.
- Concurrent two collections of 8 against balance 10: one success, final balance 2, never negative.
- Foreign/closed shift denial; close/post serialization; expected cash = opening + cash ledger, transfers excluded.
- Forced audit INSERT failure rolls back sale, stock, payment/idempotency effects.
- Purchase return preserves original quantity and is retry-safe; discounted fractional sale returns finish at exact cumulative refund; damaged returned goods generate receive + spoilage with zero net quantity.
- SQL-derived opening/movement stock, customer receivable and supplier payable reconcile to stored values.
- REST purchase replay through sync ignores irrelevant source/default metadata and returns the original record ID.
- Fractional browser amounts 0.30−0.10 and expense sum 0.10+0.20 render without floating-parser crashes; draft precision has unit coverage. No full accounting/GL certification is implied.

## Lost response and UI evidence

1. Browser sale POST really committed (201); Playwright dropped its response. Original ID was already queued locally; reload retained it; sync returned duplicate; SQL found exactly one sale and the queue cleared.
2. Browser expense POST really committed (201); response dropped. Reload/manual retry sent the same durable ID and returned 200; SQL found exactly one **-0.30** cash entry. Pending retry key cleared only after confirmed success.
3. Arabic RTL and no root overflow tested for dashboard, POS, products and reports at **1440, 768, 390 px**. Earlier 390px reports overflow was reproduced and fixed, not suppressed.
4. Selected screenshots from the final passing run: [desktop dashboard](screenshots/dashboard-desktop.png), [tablet POS](screenshots/pos-tablet.png), [mobile reports](screenshots/reports-mobile.png). These contain synthetic demo data only. Browser traces are not published because they can contain test credentials.

This does not prove service-worker cold-offline boot, real mobile devices, every modal/page at every viewport, thermal printing, accessibility conformance or sustained load.

## Restart/outage evidence

Executed twice during audit; final execution after the 27-test run:
- Save row counts and SHA-256 of ordered complete rows in `tenants`, `users`, `sales`, `sale_items`, `purchases`, `purchase_items`, `payments`, `products`, `customers`, `suppliers`, `shifts`, `inventory_movements`, `financial_transactions`, `processed_mutations`.
- Stop actual PostgreSQL process. `GET /api/health` → **503**, `{"ok":false,"error":"database_unreachable"}`. Login → **500**, generic INTERNAL message, no connection details.
- Stop Next; restart persisted native cluster; restart production Next with restricted role. Health → **200**.
- Recompute all 14 fingerprints: exact match, **14 sales retained**. Earlier independent run retained 8 before subsequent browser fixtures added sales.
- This tests persisted local cluster/process restart, **not backup restore, physical disk loss or host disaster recovery**.

## Executed commands / local harness

Synthetic URLs/secrets were sourced from ignored `.audit-local/env` without printing them. This is an execution record, not credentials to copy into production.

```sh
npm ci
npx next typegen
npm run typecheck -- --incremental false
npm run lint
npm test
ARENA_PREVIEW=1 npm run build
npm audit --omit=dev
npm audit --json                 # exit 1, five development-only high findings
npm run db:migrate              # owner fixture DB, including fresh 0000–0006
npm run db:migrate              # no-op repeat
npx tsx scripts/test-role.ts     # refuses non-local/non-test database
npx tsx src/db/seed.ts            # isolated demo fixtures only
NODE_ENV=production npm exec tsx src/db/bootstrap.ts  # separate fresh test DB, twice
DATABASE_URL="$APP_DATABASE_URL" ARENA_PREVIEW=1 npm run start
npx playwright test
bash -n scripts/backup.sh scripts/restore.sh scripts/verify-rls.sh
git diff --check
node .audit-local/persistence.mjs before
# stop PostgreSQL process; curl health/login; stop Next; restart both with process tools
node .audit-local/persistence.mjs after
curl -s -o .audit-local/evidence/restart-health-final.json -w '%{http_code}' http://127.0.0.1:3000/api/health
```

Fresh/bootstrap verification used a Node `pg`/`spawnSync` harness: assert loopback `meqwat_audit_test` owner URL, create **new** `meqwat_bootstrap_test`, migrate twice, bootstrap twice with a randomly generated synthetic admin password, then independently query plans/admins/tenants/migration counts. No existing database was dropped.

Local tooling: `embedded-postgres@16.4.0-beta.14`; @sparticuz Chromium with bundled libraries via `PLAYWRIGHT_EXECUTABLE_PATH`/`LD_LIBRARY_PATH`; CI is configured to install official Playwright Chromium. App bound to 0.0.0.0:3000, DB loopback:55432. `ARENA_PREVIEW=1` is sandbox/isolated HTTP CI only, not production security configuration.

### Real failed runs retained, not hidden

- Original RLS missing-context test: **FAIL** (saw 7 seeded products); remediated and now PASS.
- Earlier responsive run: **22/23**, 390px report overflow; fixed and rerun.
- Earlier production startup guard relying only on instrumentation did not exit; replaced with preflight wrapper and retested.
- Final-stage repeat browser runs: **24/26**, then **26/27** due to correctly persistent subscription/login rate buckets exhausted by repeated tests, not HTTP auth success. Cleared **only** rate-limit fixtures on explicitly guarded loopback `meqwat_audit_test`; did not disable the limiter or touch production. Full subsequent run: **27/27 PASS**. Prefer fresh disposable databases for repeat CI runs.
- Full dependency audit still **FAIL**; production audit PASS is not a clean full tree.

Raw local outputs in ignored `.audit-local/evidence/`: `tests-final.log`, `browser-final.log`, `typecheck-final.log`, `lint-final.log`, `build-final.log`, `production-audit-final.log`, `full-audit-final.json`, `fresh-bootstrap-final.log`, `persistence-final.log`, outage/restart JSON and rate-bucket-failure logs. Durable results are this document; ignored tooling/logs are not guaranteed to survive workspace re-creation.
