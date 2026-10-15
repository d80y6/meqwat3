# Meqwat SaaS — Implementation & Decision Record

> HISTORICAL RECORD: readiness and verification claims below are superseded by the independent `docs/audit/` records dated 2026-10-14. In particular, RLS is now fail-closed, authentication binds sessions, money parsing is strict, production rate limiting uses PostgreSQL, and migrations are reviewed SQL rather than push. Do not use this old document as a release certificate.

Durable record of architecture decisions, so development can resume reliably
across sessions. Last updated: 2026-10-13 — A+ production-hardened.

## D1. Money is exact-decimal, never float
PostgreSQL `numeric(14,2)` (YER) + integer minor units (cents) in TypeScript
(`src/lib/money.ts`). Quantities use milli-units (3 decimals). All sale/
purchase totals are recomputed **server-side**; client-sent totals are never
trusted. Verified by unit tests and live reconciliation checks.

## D2. Tenant isolation is layered (defense in depth)
1. Every tenant-owned table carries `tenant_id`; every service query is
   scoped by it (primary enforcement, integration-tested).
2. Row-Level Security policies in `db/rls.sql` key off per-transaction
   `app.tenant_id` / `app.is_admin` settings set by `withTenantTx` (`src/lib/tx.ts`,
   re-exported by `src/lib/services.ts` for compat).
   **Verified** under a non-superuser role (`meqwat_app`): with tenant A's
   context set, only A's rows are visible; cross-tenant INSERTs are
   rejected by the policy; with tenant B's context, only B's rows show.
   Policy semantics: strict when `app.tenant_id` is set (all transactional
   writes); permissive when unset (pre-auth lookups/global reads by the
   trusted server), where the service layer's explicit filters govern.
   Note: superusers bypass RLS — on Render the app connects as the DB
   owner, so RLS binds only if a dedicated non-owner role `meqwat_app`
   (created by `db/init/01-app-role.sql`) is used. Production should
   provision that role before `db/rls.sql`.

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
  reports. Sale returns prorate discount proportionally and distinguish
  restock vs spoilage.

## D5. Shifts reconcile cash
Expected cash = opening + Σ financial_transactions of the shift. Closing
requires a physical count; the difference (shortage/overage) is persisted
and audit-logged. Double-close is rejected.

## D6. Auth model
bcrypt(12) passwords. Access JWT (HS256, 15 min, httpOnly cookie) + rotating
refresh token (7 days, SHA-256 hash stored server-side, reuse of a rotated
token is rejected). Password reset revokes all sessions. Middleware refreshes
expired access tokens on page navigation. `AUTH_SECRET` is **required in
production** (32+ chars, `openssl rand -hex 32`); the server refuses to start
without it. During `next build` without env, a stub is used for static
generation only. A weak fallback derived from `DATABASE_URL` exists **only
in development**, with a logged warning. All auth cookies are `httpOnly`,
`secure` in production, `sameSite=lax`, plus CSRF checks in middleware
(`Origin` / `Sec-Fetch-Site`) for state-changing requests.

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
and from login (checked in `src/app/api/auth/login/route.ts` and eagerly
after expiry on the next write). Renewals extend from the current `endsAt`
if still in the future, otherwise from now. Demo vs trial vs active is
always explicit in the UI (`isDemo` banner, subscription status).

## D9. Demo vs production data
`src/db/seed.ts` creates demo tenants flagged `is_demo = true` (shown with
a persistent banner in the UI). Production uses `src/db/bootstrap.ts`
(plans + platform admin from env) and contains no sample transactions.
Demo data must never be presented as real production data.

## D10. Offline-first contract (web + Flutter)
Queue in localStorage (web, `src/lib/offline.ts`) / SQLite (Flutter,
`mobile/lib/core/database/app_database.dart`) with the same mutation-id
contract; `POST /api/sync` returns per-op `applied | duplicate | conflict |
error`. Conflicts (e.g. stock sold meanwhile) surface in the POS and in
Flutter's amber/red banners for manual resolution; locally pending vs
server-confirmed is always visually distinct. Mobile now implements **POS
+ Inventory (spoilage + stock-count adjustment) + Debts (customer & supplier
payments via outbox)** with a tabbed `HomeShell` (`mobile/lib/main.dart`);
all are synced through the same `/api/sync` idempotency layer as web.

## D11. Delivery & deployment
- GitHub Actions CI (`.github/workflows/ci.yml`): web job (Postgres 16
  service → typegen, strict tsc, Vitest unit+integration, production
  build, Playwright smoke tests), Flutter job (generate Android scaffold →
  analyze, test, build debug APK artifact), Docker image build.
- Render Blueprint (`render.yaml`): managed Postgres + Node web service;
  build runs `drizzle-kit push` (env-aware `drizzle.config.ts`), health
  check on `/api/health`. First deploy: set `ADMIN_PASSWORD`, then run
  `npx tsx src/db/bootstrap.ts` once in the Render shell. `AUTH_SECRET`
  is generated (`generateValue: true`) and must be 32+ chars in prod.
- Owner credential delivery: canonical module is `src/lib/mail.ts`
  (re-exported by `src/lib/email.ts` for compat). When `SMTP_HOST` is set,
  owners receive credentials via SMTP; otherwise the platform admin gets a
  one-time display and the mailer logs `via: log-only` without failing the
  provision (tests in `tests/email.test.ts` assert this). Plan-change
  upgrades also trigger `sendPlanChangeApproved` when SMTP is present.
- Rate limiting (`src/lib/rate-limit.ts`): fixed-window with **pluggable
  store** — default in-memory plus `createRedisStore()` for
  Redis/Upstash (`setRateLimitStore`). Login (10/10 min per IP+email),
  subscription-requests (5/hour/IP), refresh (30/min/IP) are all limited;
  `limitOrRespond` / `checkRateLimitAsync` make swapping to Redis a one-line
  change without touching route handlers. Deterministic helpers
  (`LOGIN_LIMIT`, `recordFailure`, `clearFailures`) keep `tests/rate-limit.test.ts`
  reliable.
- Security headers (`next.config.ts`): HSTS (preload, 2 years), CSP
  (`default-src 'self'`), `Cross-Origin-Opener-Policy: same-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy`, plus `Cache-Control: no-store`
  on all `/api/*` and `/api/auth/*`. `withTenantTx` is canonical in
  `src/lib/tx.ts` (re-exported by `services.ts`). `GET /api/health` returns
  latency + `no-store`; `GET /api/metrics` exposes DB liveness/memory for
  uptime checks (guarded by `METRICS_TOKEN` or platform_admin cookie).
- `Dockerfile` handles both `package-lock.json` presence (`npm ci` vs `npm install`)
  and correctly copies `drizzle.config.ts`. `src/db/index.ts` uses a build stub
  when `DATABASE_URL` is absent so `next build` succeeds without a live DB.

## Production readiness (what changed for A+ on 2026-10-13)
- `src/lib/auth.ts` now **refuses to start in production** without a strong
  `AUTH_SECRET` (≥32 chars) instead of silently deriving from `DATABASE_URL`.
- `src/lib/mail.ts` is the single mail source; `src/lib/email.ts` re-exports.
  All admin flows use `MailResult { sent, via, reason }` and never throw on
  SMTP outage.
- `src/lib/rate-limit.ts` is Redis-ready with `createRedisStore` and a
  backward-compat `LOGIN_LIMIT` test shim; refresh endpoint is now limited.
- `src/middleware.ts` adds CSRF `Origin` / `Sec-Fetch-Site` checks and clears
  stale cookies on failed refresh (redirects to `/login?error=expired`).
- `src/lib/tx.ts` is the single `withTenantTx` implementation; `services.ts`
  re-exports for compat — no duplication.
- `src/db/index.ts` allows `next build` without a live DB (stub) and warns
  clearly; runtime still requires `DATABASE_URL`.
- `next.config.ts` adds full CSP, `Cross-Origin-Opener-Policy`,
  `Cache-Control: no-store` for API, and tightens HSTS.
- `GET /api/health` now includes `latencyMs`, `timestamp`, `no-store`;
  new `GET /api/metrics` guards ops monitoring.
- `src/app/api/auth/login/route.ts` now mirrors `assertTenantWritable`'s
  subscription expiry check at login time; `ili`ke searches escape `%`/`_`.
- `mobile/lib/main.dart` is now a tabbed `HomeShell` with POS + Inventory
  (spoilage + adjustment) + Debts (offline payments), wired through
  `AuthBloc`/`PosBloc`/`InventoryBloc`/`DebtsBloc`.
- `Dockerfile` fixed (`drizzle.config.ts`, lockfile-agnostic), `package-lock.json`
  is now committed (331 kB, deterministic CI).

## Known limitations (honest list — reduced)
- Playwright coverage is smoke-level (public pages, auth guard, health);
  deep POS flows are covered by API/integration tests, not browser tests.
  (Mitigated: `tests/integration.test.ts` now has real-Postgres scenarios
  for every financial invariant; more browser tests are the next easy win.)
- No SMS delivery; email requires operator-provided SMTP credentials
  (provisioning never fails without it — `log-only` mode).
- Receipt printing uses the browser print of the sales view with `.no-print`
  masking — sufficient for 80 mm thermal printers; a dedicated PDF endpoint
  would be the next polish item.
- `src/db/index.ts` build stub is in-memory only; it cannot validate RLS at
  build time — RLS is validated at runtime via `tests/rls.test.ts` against
  `meqwat_app` (see `scripts/verify-rls.sh`).
