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
- Local HTTP/browser: 31 PASS before subsequent billing/user-limit/catalog tests and final edits; final rerun pending.
- All Dart lib/test files parsed without syntax errors using tree-sitter-dart. **Not Flutter analyze, tests or compilation.**
- Prior PR commit f1071d0 hosted CI: Docker image build PASS; web failed a non-hermetic APP_ORIGIN unit test; mobile failed scaffolding before analysis. Fixes now scope test origin, create scaffolding without pub resolution, remove unused intl constraint, and expose build diagnostics through check annotations. New hosted run pending.
- Migrations 0007 and 0008 applied to isolated `meqwat_completion_test`; repeat/fresh verification and recovery drill to be recorded.

## Not yet completed
- Native compilation/device acceptance, including SQLite upgrade, storage failures, restart and cross-account behavior; no claim that new mobile screens have run.
- Secure persisted sessions and authenticated cold-offline start; full conflict edit/reconcile flow; physical printing, signed release/store distribution.
- Actual SMTP/staging-managed deployment and off-site/PITR/RPO/RTO acceptance. CI recovery drill added; not yet executed at this checkpoint.
- Historical purchase-return reconciliation and full tenant accounting allocation/reversal/GL/consignment/multi-branch requirements. These cannot be replaced with fabricated historical data or silently invented accounting policy.
- Complete accessibility/load/security hardening; remaining development-only dependency advisories.

## Durable next actions
1. Rebuild latest server, run all local Vitest and Playwright tests (including billing, entitlement concurrency and >200 catalog).
2. Commit/push on the session branch to exercise hosted Flutter/web/recovery/container CI, inspect diagnostics, fix and rerun.
3. Obtain physical/emulated-device acceptance and staging mail/deployment access; close remaining business/accounting decisions and workflows.
4. Update this document and release gate matrix with actual outcomes. Do not label all requested work complete.
