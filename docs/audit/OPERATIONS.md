# Safe deployment and recovery runbook

**Do not deploy this branch without closing PRODUCTION-READINESS.md gates.**

## Database identities and migrations
- Schema owner: migrations, bootstrap, backup/restore ONLY. Runtime: `meqwat_app`, non-superuser, no BYPASSRLS, no schema CREATE privilege. Runtime now refuses owner connections.
- New empty database: `DATABASE_URL=<owner URL> npm run db:migrate`. All SQL files run in one locked transaction; checksum mismatches fail. Run again to verify no-op.
- Existing unversioned database: first snapshot/backup and restore into isolated staging; compare ALL columns/types/defaults to `0000_initial.sql`, not just table names. Run `npm run db:migrate -- --baseline-existing` ONLY after review. The flag merely confirms operator review and skips initial CREATE TABLEs; it does NOT prove equivalence. Constraint violations roll back the complete migration. Never use `drizzle-kit push` on production.
- Historical purchase returns previously overwrote quantities. They CANNOT be reconstructed automatically. Reconcile affected original invoices/ledgers from external records BEFORE deployment. Existing processed mutation rows have no request fingerprint: retries return 409 for manual reconciliation, not new postings.
- Apply/grant the restricted role after schema creation. Docker's init SQL provisions it on NEW volumes only; existing volumes need manual owner provisioning and grants. Preserve volume backups.
- `DATABASE_URL=<owner URL> ADMIN_PASSWORD=<secret> npx tsx src/db/bootstrap.ts`. Bootstrap/seed must never use application-role credentials. Seed is now forbidden with NODE_ENV=production.
- Copy runtime `DATABASE_URL` using meqwat_app, AUTH_SECRET (32+ random chars), APP_ORIGIN=https://your-domain, SMTP settings if recovery/delivery is enabled. Set secrets using deployment secret storage, not committed files or shell command histories.
- Render build no longer changes DB. Its blueprint retains the owner URL as MIGRATION_DATABASE_URL; supply DATABASE_URL separately with a restricted application URL in the dashboard after manual owner migrations. Do not enable automatic release before that step.
- SQL migrations, not schema push, also own manually specified composite FKs, checks, triggers and policies. Drizzle metadata is only schema-generation support; `scripts/migrate.ts`/`meqwat_migrations` is the execution/checksum source of truth. Give new SQL files unique, increasing numeric prefixes.

## Runtime security / monitoring
- Reverse proxy must terminate TLS, overwrite Host/forwarded headers, enforce body-size limits and rate limit upstream floods. Set APP_ORIGIN to the exact HTTPS origin. Cookie mutations have server CSRF checks; native clients deliberately omit browser Origin/Fetch Metadata.
- `GET /api/health`: 200 only with DB connectivity, 503 with sanitized failure. Metrics require a platform-admin session or METRICS_TOKEN.
- Production sensitive routes use atomic PostgreSQL rate buckets. Schedule daily owner maintenance: `DELETE FROM rate_limit_buckets WHERE resets_at < now() - interval '1 day';` and an approved session/reset-token retention policy. Alert on 5xx, DB pool saturation, disk usage, audit-write failures, rejected synchronizations, backup age.
- Tenant posting transactions are intentionally serialized: correct balances and lock ordering take priority over throughput. Measure peak tenant load before raising scale claims.
- Security headers retain anti-framing by default. ARENA_PREVIEW=1 is an explicit sandbox-only build flag; never enable in public production.

## Recovery
- `DATABASE_URL=<backup owner URL> ./scripts/backup.sh <secure directory>` requires pg_dump matching server major version. Restrict directory/file permissions and encrypt + copy off-host. Local retention alone is not disaster recovery.
- Restore ONLY into a fresh isolated target first. `DATABASE_URL=<isolated owner URL> ./scripts/restore.sh <dump>` asks for RESTORE; now uses `--dbname`, `--single-transaction`, `--exit-on-error`. No production restore was performed in this audit.
- Verify migration checksums, row counts, tenant isolation, ledger/stock sums, latest committed sale, authentication, health and browser journeys. Reapply role grants; dumps exclude ownership.
- Define and test RPO/RTO, scheduled backup delivery, point-in-time recovery and alerting with infrastructure owners. These remain operational release gates, not assertions based on scripts.

## Offline/mobile compatibility
- Web v1 ownerless localStorage outboxes and Flutter ownerless SQLite payloads are quarantined (retained, never auto-replayed). Recover them manually against original tenant/user and server mutation records; do not assign them to whoever next logs in.
- Web POS/purchase writes local outbox before transport; retains original ID on uncertain responses; server binds it to user/type/payload. Other financial forms retain an owner-scoped hashed-request ID (`meqwat_pending_v1`) for identical manual retries after uncertain responses/reload. These keys are not a background outbox; reconcile uncertain effects before clearing them.
- Flutter changes require `flutter analyze`, `flutter test`, `flutter build apk --debug` and a two-account/device restart/offline sync test. Do not distribute pre-existing committed generated APK/web artifacts as evidence of these source changes.
- No service worker/web app-shell offline cache was found. Web queueing works while the loaded application remains available; cold offline reload is not certified. Flutter retains sessions in memory and requires login after restart.


## Evidence and test-environment hygiene
- Fresh migrations 0000–0006 and production-mode bootstrap/repeat passed on a separate empty local test DB. Main demo DB passed 56 Vitest and 27 browser/API checks plus exact 14-table restart persistence. See TEST-RESULTS.md; these do not waive staging/restore/mobile gates.
- Tests import a loopback/`test` database guard. Use a fresh disposable test DB per CI run; fixtures intentionally exercise real database writes. Never point tests or seed at production, even if a tenant is marked demo.
- PostgreSQL-backed rate limits survive process restarts. Repeated local browser suites can correctly hit 429. Prefer fresh fixtures/wait for expiry; only a deliberately isolated test DB may have test buckets reset. Do not reset production buckets to make a test pass or disable rate limiting in the app.
- Local test URLs/signing keys belong in ignored environment files or the process environment. Never publish Playwright traces containing authentication payloads. Only selected synthetic screenshots are included in this audit.
- Runtime `ARENA_PREVIEW=1` relaxes security for the sandbox/isolated HTTP CI fixture; never carry it into production. Verify secure cookies, exact APP_ORIGIN, anti-framing headers and HTTPS separately on staging.
