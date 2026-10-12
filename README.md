# منصة مقوات — Meqwat SaaS

Multi-tenant SaaS for qat traders and shop owners in Yemen & the Horn of
Africa: point-of-sale, inventory & daily spoilage, customer debts, supplier
& consignment liabilities, purchases, cash registers & shift reconciliation,
reports, subscriptions — Arabic-first RTL, offline-first.

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
npx drizzle-kit push            # create schema
psql "$DATABASE_URL" -f db/rls.sql   # enable RLS policies (optional locally)
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
```bash
# Option A — Docker
POSTGRES_PASSWORD=... AUTH_SECRET=$(openssl rand -hex 32) docker compose up -d --build
# then, once:
docker compose exec app npx drizzle-kit push
ADMIN_PASSWORD='...' docker compose exec app npx tsx src/db/bootstrap.ts

# Option B — bare metal
npm run build && npm run start   # behind a TLS reverse proxy
```
`src/db/bootstrap.ts` creates the plan catalog + first platform admin from
env — **no demo data**. Never run `seed.ts` in production.

## Operations
- **Health**: `GET /api/health` (checks DB connectivity)
- **Backup**: `DATABASE_URL=... ./scripts/backup.sh ./backups` (daily cron recommended)
- **Restore**: `DATABASE_URL=... ./scripts/restore.sh backups/<file>.dump`
- **Audit**: every sensitive action is written to `audit_logs` (UI: سجل التدقيق)

## Tests
```bash
npx vitest run        # unit (exact money) + integration (real PostgreSQL)
```
Integration tests create and fully remove `test-*` tenants.

## Key docs
- `docs/DECISIONS.md` — architecture decisions + honest known limitations
- `mobile/README.md` — Flutter client contract & status
