# منصة مقوات — Meqwat SaaS

> **Independent audit (2026-10-15): NOT READY for production certification.**
> See [release gates](docs/audit/PRODUCTION-READINESS.md), [findings](docs/audit/FINDINGS.md),
> and [safe deployment/migration runbook](docs/audit/OPERATIONS.md). Prior readiness claims are superseded.

Multi-tenant SaaS for qat traders and shop owners in Yemen & the Horn of
Africa: point-of-sale, inventory & daily spoilage, customer debts, supplier
liabilities, purchases, cash registers & shift reconciliation,
reports, subscriptions — Arabic-first RTL, with a persisted offline operation queue (not a cold-start offline web app).

## Stack
- **Web**: Next.js 16 (App Router, strict TypeScript), Tailwind CSS v4
- **DB**: PostgreSQL 16, Drizzle ORM, Row-Level Security (`db/rls.sql`)
- **Auth**: bcrypt + JWT access tokens + rotating refresh-token sessions
- **Mobile**: Flutter + BLoC clean architecture (`mobile/`)
- **Tests**: Vitest (unit + real-PostgreSQL integration)

## Quickstart (development)
```bash
cp .env.example .env            # set DATABASE_URL (and AUTH_SECRET)
npm install
npm run db:migrate              # reviewed migrations, using schema-owner URL
 # RLS is installed by migrations; provision/grant meqwat_app for runtime
npx tsx src/db/seed.ts          # DEMO data (is_demo tenants) — dev only
npm run dev                     # http://localhost:3000
```

Demo logins (seeded environment only):
| Role | Email | Password |
|---|---|---|
| Platform admin | admin@meqwat.app | Admin@1234 |
| Shop owner | owner@baraka.ye | Owner@1234 |
| Manager | manager@baraka.ye | Manager@1234 |
| Cashier | cashier@baraka.ye | Cashier@1234 |

## Production

### Option A — Render (recommended)
1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo (`render.yaml`
   provisions Postgres + the web service; migrations are a separate reviewed step).
3. Set `ADMIN_PASSWORD` in the web service env, then once in the Render
   Shell: `npx tsx src/db/bootstrap.ts` (plans + platform admin).
4. GitHub Actions CI runs on every push: web tests/build/E2E, Flutter
   analyze/test/APK build, Docker image build.

### Option B — Docker
Provision `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `AUTH_SECRET` through secret storage
before running Compose. Do not put real passwords in committed files or command history.
```bash
docker compose build app
docker compose up -d db
# MIGRATION_DATABASE_URL is the owner URL on the Compose network (host db).
docker compose run --rm -e DATABASE_URL="$MIGRATION_DATABASE_URL" app npm run db:migrate
docker compose run --rm -e DATABASE_URL="$MIGRATION_DATABASE_URL" -e ADMIN_PASSWORD app npx tsx src/db/bootstrap.ts
docker compose up -d app
```
Existing volumes do not re-run init SQL. Follow `docs/audit/OPERATIONS.md` for
restricted-role provisioning/grants and backup-first schema adoption.

### Option C — bare metal
```bash
npm run build && npm run start   # behind a TLS reverse proxy
```
`src/db/bootstrap.ts` creates the plan catalog + first platform admin from
env — **no demo data**. Never run `seed.ts` in production.

Optional env: `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM` —
when set, new shop owners receive their one-time credentials by email.

## Operations
- **Health**: `GET /api/health` (checks DB connectivity)
- **Backup**: `DATABASE_URL=... ./scripts/backup.sh ./backups` (daily cron recommended)
- **Restore**: `DATABASE_URL=... ./scripts/restore.sh backups/<file>.dump`
- **Audit**: every sensitive action is written to `audit_logs` (UI: سجل التدقيق)

## Tests
```bash
npm test             # unit + integration; requires disposable local *test* DB
npx playwright test  # production server uses APP_DATABASE_URL restricted role
```
Integration tests create and fully remove `test-*` tenants.

## Key docs
- `docs/DECISIONS.md` — architecture decisions + honest known limitations
- `mobile/README.md` — Flutter client contract & status
