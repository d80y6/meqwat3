# Admin/mobile completion work — 2026-10-15

This is a new implementation checkpoint after PR #3's original audit. **NOT READY** remains the release verdict. This document supersedes older statements that admin has only create/list plans or that mobile has only four basic screens. It does not mark unexecuted gates complete.

## Implemented this checkpoint
- Admin plan edit/activation/features, strict validation and actor/payload-bound idempotency.
- Correct deterministic latest subscription; searchable paginated tenants/requests and platform-wide audit viewer.
- Tenant details, usage, user roles/status, last-owner protection, session revocation and reset email request with delivery result.
- Locked/retry-safe manual subscription extensions and explicit status/end-date controls; atomic platform operation audit.
- Concurrent user creation/reactivation and product creation limits share tenant locks; downgrades below current usage rejected.
- Manual YER SaaS invoices, partial collections and bounded refunds, immutable documents, transactional audit and replay protection. This is not a gateway/tax/proration engine; collection does not automatically renew a subscription.
- Web selectors exhaust API pages instead of silently stopping at 200 entities.
- Mobile exact money, save-before-cart-clear, direct financial retry IDs, coordinated refresh including /auth/me, owner-specific caches and SQLite v2 migration.
- Native password forms, role-aware navigation, outbox review/retry, POS customer/credit/discount/shift selection, master-data/user forms, sales and purchase-return screens, receipt copying, cash/shift/expense forms, reports and subscription requests.
- Foreground periodic sync with a single-flight guard (not an OS background service).

## Verification checkpoint (updated as executed)
- Local TypeScript/lint/build PASS during implementation.
- Local Vitest: 67 PASS / 8 files at checkpoint.
- Local HTTP/browser: **37/37 PASS**, including billing, user-limit concurrency, >200 catalog and safe cancellation.
- Flutter analysis/tests/debug APK and emulator persistence passed in hosted CI (not merely syntax parsing).
- Prior PR commit f1071d0 hosted CI: Docker image build PASS; web failed a non-hermetic APP_ORIGIN unit test; mobile failed scaffolding before analysis. Fixes now scope test origin, create scaffolding without pub resolution, remove unused intl constraint, and expose build diagnostics through check annotations. Subsequent hosted run **38792146565 / 9d78568** passed all four jobs: web, Docker restricted runtime, mobile analyze/test/debug APK, and Android persistence acceptance.
- Migrations 0000–0008 applied on fresh isolated CI databases. Actual backup/restore drill passed in hosted web CI, comparing complete-row hashes/counts of all public tables.

## Not yet completed
- Whole-app online/offline device journeys and every native screen are not yet certified. Emulator acceptance proved real SQLite reopen/owner isolation, durable request IDs, legacy quarantine and OS secure storage. Flutter analysis/unit tests/APK passed; this is not a full physical-device acceptance suite.
- Secure session persistence and an eight-hour bounded last-verified offline identity are implemented (shortened by subscription expiry); server authorization remains authoritative on sync. Safe cancellation tombstones unposted operations and preserves local originals for manual correction; committed operations cannot be cancelled. Physical printer acceptance and release signing/store distribution remain external gates. Arabic PDF generation and its bundled offline font passed hosted tests at `55aca77`; hardware printing remains untested.
- Actual SMTP/staging-managed deployment and off-site/PITR/RPO/RTO acceptance. CI recovery drill passed; off-site/PITR/RPO/RTO and managed-host staging remain unproved.
- Historical purchase-return reconciliation and full tenant accounting allocation/reversal/GL/consignment/multi-branch requirements. These cannot be replaced with fabricated historical data or silently invented accounting policy.
- Complete accessibility/load/security hardening; remaining development-only dependency advisories.

## Durable next actions
1. Final CI rerun for PDF printing and pruned runtime dependencies; local latest backend tests are green.
2. Inspect final hosted results and fix any new failure; keep the same branch/PR.
3. Obtain physical/emulated-device acceptance and staging mail/deployment access; close remaining business/accounting decisions and workflows.
4. Update this document and release gate matrix with actual outcomes. Do not label all requested work complete.


## Security and release details
- Mobile sessions use OS secure storage, origin-specific keys, logout deletion and bounded cached identity; no passwords are persisted. Offline records remain pending and can be rejected after server-side revocation.
- SQLite v2 preserves existing outbox records and adds owner-bound HTTP retry keys/caches. Confirmed receipt recording and queue acknowledgement are atomic.
- Android Gradle/AGP/Kotlin updated to supported versions; release INTERNET permission added, cleartext/automatic backup disabled, stable `com.meqwat.mobile` identity. Release no longer falls back to debug signing: private `android/key.properties` is required.
- Runtime Docker dependencies are pruned to production-only; development advisory chain remains build-time risk, not a clean full audit.
- Application-level mobile lock screen/biometric policy, complete post-settlement accounting and consignment/branch policy require explicit acceptance rather than invented guarantees.


## Later fixes, verification tracked by PR checks
- User API now provides bounded pages/total; web/native collections terminate beyond 200 users.
- Stable ordering for paged operational records. Debt summary uses one SQL snapshot of all positive balances, including disabled accounts; settling an existing disabled supplier payable remains allowed, while new purchases stay blocked.
- Mobile payment dialog waits for durable enqueue, preserves input on failure, and distinguishes a failed refresh after a successful save. Fractional POS quantities use exact integer thousandths and reject stock/total overflow before updating drafts.
- Local latest backend typecheck/build, 67 tests and 37 browser/API tests passed. Final hosted rerun is required for the new native edits; previous all-job green checkpoint is `55aca77` / run `38793293945`.
