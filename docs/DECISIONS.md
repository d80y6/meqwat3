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
   **Caveat:** PostgreSQL superusers bypass RLS. Production must connect as
   a non-superuser role (e.g. `meqwat_app`) for the policies to bind; the
   sandbox runs as `postgres`, so RLS binding is **not yet verified** under
   a restricted role — service-layer isolation is what is tested today.

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

## Known limitations (honest list)
- Flutter client (`mobile/`) is a clean-architecture scaffold; it has not
  been compiled in this environment (no Flutter SDK available).
- No automated browser E2E (Playwright) yet; journeys were verified via
  scripted HTTP calls against the production build + integration tests.
- No login rate limiting / CAPTCHA; add before public exposure.
- No email/SMS delivery; owner temp passwords are handed over by the admin.
- Receipt printing uses the browser print of the sales view.
- Monitoring is `/api/health` + structured audit logs; no metrics/alerting.
- RLS under a non-superuser app role is written but unverified (see D2).
