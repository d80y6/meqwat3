# Production readiness — 2026-10-15

## Verdict: **NOT READY**

The existing application was retained and materially repaired. The final local evidence is substantially stronger than baseline, but **the requested production and complete-business-workflow acceptance criteria are not all met**. No production certification, deployment, migration, real mail delivery or actual backup restore was performed.

### Final evidence at a glance

| Area | Status |
|---|---|
| Typecheck / lint / production build | **PASS** (lint: 0 errors, 1 warning) |
| Unit + real PostgreSQL integration / RLS | **56/56 PASS**, 7 files, zero skips |
| Real restricted-role HTTP + Chromium | **27/27 PASS**, latest application build |
| Production dependencies | **PASS**, zero advisories |
| Entire dependency tree | **FAIL**, five high development-only advisories |
| Fresh migrations + repeat / bootstrap + repeat | **PASS**, all seven SQL migrations; 3 plans, 1 admin, 0 demo tenants |
| Database + application restart persistence | **PASS**, 14 complete table fingerprints unchanged, 14 sales retained |
| Database outage / recovery | **PASS**, sanitized health 503/login 500, restored health 200 |
| Actual dump/restore / container / managed deployment | **BLOCKED / NOT TESTED** |
| Flutter build/device/offline acceptance | **BLOCKED** |
| Real SMTP delivery/recovery | **BLOCKED** |
| Full accounting, consignment, large-catalog/branch scope | **INCOMPLETE / NOT CERTIFIED** |

## Architecture and preserved implementation

Next.js **16.4.0**, React **19.2.6**, TypeScript, Tailwind 4, PostgreSQL **16.4** tested via `pg`/Drizzle, jose/bcrypt cookie sessions. Domain services own financial postings. Flutter/BLoC/SQLite is a separate client. The web queue uses localStorage; no service-worker offline shell was found. SMTP is optional; recorded `transfer` is not a payment-gateway/bank integration.

Work stays on `arena/6b6973be-meqwat3`, starting from `c00501ff025543174ae3fbb64ead8edb1e51515e`. No rebuild-from-scratch or replacement application was introduced. See [baseline](BASELINE.md), [findings](FINDINGS.md), [remediation history](REMEDIATION-LOG.md), [executed tests](TEST-RESULTS.md), [operations](OPERATIONS.md), and [changed-file inventory](CHANGED-FILES.md).

## What was remediated and demonstrated

- Operation-specific RBAC in API/sync/services; live session/user/tenant checks; API CSRF; atomic refresh, reset and initial-password enforcement.
- Fail-closed transaction-local RLS, restricted runtime startup checks, composite tenant constraints and posted-record protection.
- Strict decimal/quantity parsing and exact posting arithmetic; ownership/closed-shift validation; serialized postings; transaction-bound audit and payload-bound idempotency.
- Safe cumulative returns, preserved original purchase quantities, receive/spoilage accounting, transfer/cash distinction and SQL-reconciled balances.
- Atomic concurrent subscription approval; renewal of an existing tenant without duplicate provisioning.
- Owner-bound write-before-send POS/purchase outbox; safe ambiguous retries for other financial forms; real response-loss/reload/SQL deduplication proofs.
- Monetary display/draft corrections, explicit UTC+03 day boundaries, mobile-width report layout fix.
- Versioned checksummed migration workflow, separate owner/runtime DB use, hardened operational scripts and corrected Docker/Render/CI configuration. **Configuration changes alone are not deployment proof.**

## Remaining release gates — required next work

1. **Recovery and deployment — BLOCKED.** Supply PostgreSQL client tools/container runtime and isolated staging infrastructure. Execute backup → fresh restore → independent ledger/isolation/browser verification; measure RPO/RTO. Build/run the container and stage Render with restricted runtime role, owner-only migrations, TLS, secrets, proxy headers, health/monitoring and rollback rehearsal. `docker`, `pg_dump`, `pg_restore` were not installed here.
2. **Mobile — BLOCKED.** Flutter/Dart absent. Run `flutter analyze`, `flutter test`, `flutter build apk --debug`, then physical/emulated device tests: two tenants/users, logout/login cache isolation, process restart, offline queue persistence, changed permissions, ambiguous responses, duplicate/conflict recovery. Current source edits and old generated artifacts are not compile proof.
3. **SMTP — BLOCKED.** Configure an authorized staging mail sink/provider. Verify actual initial-password and reset delivery, no secret logging, single-use expiry/replay, recipient identity and full recovery UX. No external credentials were requested or used.
4. **Historical data adoption — BLOCKED on staging/business records.** Restore the existing deployment into isolated staging; compare schema and constraints before baseline adoption. Reconcile old purchase returns whose original quantities were overwritten. No automatic migration can invent missing historical invoice facts.
5. **Accounting/product completeness — OPEN.** Define and implement invoice-level settlement allocations and required reversal/refund-after-settlement flows; obtain accounting acceptance of purchase-return valuation, report cutoffs, fiscal closing and GL requirements. Supplier payable management is not consignment ownership/commission accounting. Multi-branch operation is not independently proved.
6. **Large-catalog and entitlement correctness — OPEN.** Add pagination/server search and authoritative totals beyond the current 100/200-row UI caps; serialize/test user-plan limits under concurrent creation/reactivation. Do not sell large-plan capacity based on the current small-fixture tests.
7. **Dependency/CI/operations — OPEN.** Resolve or formally assess five development-only high advisories without an unsafe toolchain downgrade; execute hosted CI on this patch; perform staging load/pool, monitoring/alert delivery and retention acceptance. Production audit zero does not waive these gates.

## Explicit limitations

- Web durability proof covers a **loaded app**, not cold offline reload/boot. Pending non-POS retry IDs are not a background submission queue. Legacy ownerless queues remain quarantined for manual reconciliation.
- Test DB/process restart is not a restore/disaster-recovery test.
- No complete accessibility, every-page/device, thermal-printer, full penetration, prolonged load or production-infrastructure certification.
- Privileged owner/admin operational access is powerful by design. RLS protects scoped application access; it is not a sandbox against arbitrary application code/SQL execution.
- Fixed UTC+03 business-day handling matches the current market assumption; configurable tenant timezones are not implemented.
- Existing bounded debt lists can underrepresent all-account totals; do not use them as independently certified whole-ledger totals at scale.

**Release decision:** Do not promote this branch as production-ready. Re-run the complete suites against a fresh isolated database after further source changes, close the above gates, review historical migration/backfill evidence, then issue a new explicit readiness decision.
