# Meqwat SaaS — Implementation & Decision Record

Durable record of architecture decisions, so development can resume reliably
across sessions. Last updated: 2026-10-12.

## D1. Money is exact-decimal, never float
PostgreSQL `numeric(14,2)` (YER) + integer minor units (cents) in TypeScript
(`src/lib/money.ts`). Quantities use milli-units (3 decimals). All sale/
purchase totals are recomputed **server-side**; client-sent totals are never
trusted. Verified by unit tests and live reconciliation checks.

## D2. Tenant isolation is layered (defense in depth)
1. Every tenant-owned table carries `tenant_id`; every service query is
   scoped by it (primary enforcement, integration-tested).
2. Row-Level Security policies in `db/rls.sql` key off per-transaction
   `app.tenant_id` / `app.is_admin` settings set by `withTenantTx`.
   **Verified** under a non-superuser role (`meqwat_app`): with tenant A's
   context set, only A's rows are visible; cross-tenant INSERTs are
   rejected by the policy; with tenant B's context, only B's rows show.
   Policy semantics: strict when `app.tenant_id` is set (all transactional
   writes); permissive when unset (pre-auth lookups/global reads by the
   trusted server), where the service layer's explicit filters govern.
   Note: superusers bypass RLS — on Render the app connects as the DB
   owner, so RLS binds only if a dedicated non-owner role is used.

## D3. Idempotency for offline/retried mutations
Clients generate a stable `clientMutationId` per operation. The server
stores the committed result in `processed_mutations` (unique per tenant)
inside the same transaction; retries replay the stored result with
`duplicated: true` instead of double-charging stock/cash/debt. A unique
violation race falls back to reading the stored result.

## D4. Financial truth lives in signed ledgers
- `inventory_movements`: signed qty + `balance_after` snapshot per movement.
- `financial_transactions`: signed cash effect per shift.
- Customer `balance` = receivable; supplier `balance` = payable (incl.
  consignment). Balances are updated in the same transaction as the
  originating document and protected by row locks (`SELECT … FOR UPDATE`)
  plus credit-limit / overpayment validation.
- Weighted moving-average cost on purchases feeds COGS and gross-profit
  reports.

## D5. Shifts reconcile cash
Expected cash = opening + Σ financial_transactions of the shift. Closing
requires a physical count; the difference (shortage/overage) is persisted
and audit-logged. Double-close is rejected.

## D6. Auth model
bcrypt(12) passwords. Access JWT (HS256, 15 min, httpOnly cookie) + rotating
refresh token (7 days, SHA-256 hash stored server-side, reuse of a rotated
token is rejected). Password reset revokes all sessions. Middleware refreshes
expired access tokens on page navigation. If `AUTH_SECRET` is unset, a
signing secret is derived from `DATABASE_URL` (dev fallback, logged warning);
production must set `AUTH_SECRET` explicitly.

## D7. Roles
`platform_admin` (no tenant) / `tenant_owner` / `manager` / `cashier`.
Permission matrix in `src/lib/permissions.ts`, enforced server-side on every
API route; the sidebar merely hides what the role cannot use.

## D8. Subscription lifecycle
Public request → platform-admin review → approve provisions a workspace
(tenant + trial subscription + owner with one-time temp password + default
register). Requests submitted by an authenticated tenant user are linked to
that tenant server-side; approving those **upgrades the plan** (+30 days)
instead of provisioning a duplicate. Suspended tenants and expired/
cancelled subscriptions are blocked from writes (`assertTenantWritable`)
and from login.

## D9. Demo vs production data
`src/db/seed.ts` creates demo tenants flagged `is_demo = true` (shown with
a persistent banner in the UI). Production uses `src/db/bootstrap.ts`
(plans + platform admin from env) and contains no sample transactions.
Demo data must never be presented as real production data.

## D10. Offline-first contract (web + Flutter)
Queue in localStorage (web) / SQLite (Flutter) with the same mutation-id
contract; `POST /api/sync` returns per-op `applied | duplicate | conflict |
error`. Conflicts (e.g. stock sold meanwhile) surface in the POS for manual
resolution; locally pending vs server-confirmed is always visually distinct.

## D11. Delivery & deployment
- GitHub Actions CI (`.github/workflows/ci.yml`): web job (Postgres 16
  service → typegen, strict tsc, Vitest unit+integration, production
  build, Playwright smoke tests), Flutter job (generate Android scaffold →
  analyze, test, build debug APK artifact), Docker image build.
- Render Blueprint (`render.yaml`): managed Postgres + Node web service;
  build runs `drizzle-kit push` (env-aware `drizzle.config.ts`), health
  check on `/api/health`. First deploy: set `ADMIN_PASSWORD`, then run
  `npx tsx src/db/bootstrap.ts` once in the Render shell.
- Owner credential delivery: SMTP when `SMTP_*` env is configured
  (`src/lib/email.ts`), otherwise one-time display to the platform admin.
- Login + public-request rate limiting (`src/lib/rate-limit.ts`,
  in-memory fixed window) and baseline security headers
  (`next.config.ts`) are in place.

## Known limitations (honest list)
- Flutter client compiles in CI (GitHub Actions) — there is no Flutter
  SDK in the development sandbox, so first green run happens on push.
  Only POS + auth modules are implemented; inventory/debts mobile
  screens are the next iteration (web has them fully).
- Playwright coverage is smoke-level (public pages, auth guard, health);
  deep POS flows are covered by API/integration tests, not browser tests.
- Rate limiter is in-memory (single instance). For horizontal scaling,
  move counters to Redis/Upstash — call sites are isolated for that.
- No SMS delivery; email requires operator-provided SMTP credentials.
- Receipt printing uses the browser print of the sales view.
- Monitoring is `/api/health` + structured audit logs; no metrics/alerting.
