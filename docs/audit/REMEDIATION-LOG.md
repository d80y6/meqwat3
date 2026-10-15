# Remediation log — 2026-10-14 to 2026-10-15

## Baseline and continuation
Baseline recorded before source changes. Initial real-PostgreSQL execution: original financial suite 7/7 PASS. Original RLS suite: 3 PASS, 1 FAIL (no context exposed all 7 seeded products). Health returned HTTP 200. Browser attempt: 1 health PASS, 4 launch failures (missing libnspr4), not UI failures. Initial sandbox reset on continuation: scratch tooling/logs outside checkout did not survive. This record retains outcomes; fresh isolated PostgreSQL 16.4 UTF-8 database created, never production.

## Earlier implementation checkpoint (historical, not final certification)
- SEC-01: operation-level permission checks in sync AND domain envelope; purchase/payment/stock no longer inherit POS permission.
- SEC-02/AUTH-01: access tokens bound to persisted sessions; live user/tenant/role checks; refresh consumption and replacement atomic; password/role/disable revoke sessions; trial expiry exemption removed.
- SEC-03: CSRF applied to API mutations, rejects same-site cross-origin; refresh forwards cookies into current server-rendered request.
- SEC-04: fail-closed RLS; per-statement transaction-local context via scoped pg adapter; explicit privileged auth context separated; pooled connections do not retain tenant GUCs. RLS original suite now 4/4 PASS against isolated restricted role.
- FIN-01: serialize domain postings per tenant using transaction advisory lock; validate all shift references and cashier ownership; validate register ownership/match; no returns posted to historical closed shifts.
- FIN-02/03: duplicate purchase lines rejected; negative purchase costs rejected; strict decimal grammar/precision/range; bigint intermediates for multiplication/cost allocation.
- FIN-04: purchase original quantities preserved (new returned_qty); cumulative cent-allocation for discounted sale returns; reject rather than silently clamp excessive debt refunds; distinguish refund ledger entries; bank transfers do not affect cash.
- FIN-05/AUD-01: transaction envelope binds mutation key to actor/type/payload, serializes retries and writes audit atomically; HTTP financial mutations require IDs; stock/returns now included.
- OFF-01: web outbox partitioned by tenant/user; sync verifies owner; original mutation ID preserved after ambiguous network failure; legacy ownerless queue quarantined, not replayed.
- FLOW-02: approval locks request and subscription; provisioning and approval update share transaction.
- DEP-01: Next.js 16.4.0; PostCSS patched; transitive esbuild override. Remaining dependency advisory assessment pending.

Current tests and open work are detailed in TEST-RESULTS.md / FINDINGS.md. No production migration, deployment, certification or external mail delivery has occurred.

## Earlier continuation — 2026-10-15
Fresh dependency install and fresh native PostgreSQL 16.4 UTF-8 database confirm migrations apply from empty, are repeatable, and 50 automated tests pass with no skips. Previous continuation's production HTTP/browser suite passed 19/19 before the latest startup/operational changes. Results are now preserved in TEST-RESULTS.md rather than only scratch logs. Remaining current actions: rerun browser/server under startup guard, offline response-loss test, screenshots at 3 widths, restart/outage evidence, final diff/operational gate review.

Additional implemented corrections: password-recovery endpoints/UI + hashed single-use tokens + session revocation (SMTP delivery unverified); atomic PostgreSQL production rate limits; explicit runtime restricted-role/secret checks; fail-closed metrics; stock-on-return spoilage ledger; net-discounted report allocations; mobile owner-bound outboxes/cookie clearing and per-login BLoCs (Flutter compilation blocked); Docker secret exclusions/runtime COPY fix; Render no longer mutates schema during build; restore invocation corrected and atomic; CI now runs migrations, lint, production dependency audit and restricted-role browser server.


## Final checkpoint — 2026-10-15

The earlier counts above are chronological evidence, not current totals. **Final verdict remains NOT READY.** See TEST-RESULTS.md and PRODUCTION-READINESS.md for the consolidated gates.

1. Recreated isolated PostgreSQL 16.4 UTF-8 tooling and Chromium dependencies; migrated 0000–0005, later 0006. Latest independent fresh `meqwat_bootstrap_test` applies **0000–0006**, repeats no-op, runs production-mode bootstrap twice, and independently confirms **3 plans / 1 admin / 0 tenants / 7 migrations**.
2. Replaced ineffective instrumentation-only termination with `scripts/start.mjs`: bad/missing signing secret and owner connection exit 1; valid restricted role starts. Bootstrap/seed use explicit authorization context suitable for forced RLS; bootstrap comment now specifies migrations, not schema push.
3. Implemented required initial-password change (migration 0006), page/API/live guards, session revocation and mobile guidance. Real concurrent approval/password-change/relogin/renewal test passes. SMTP remains unconfigured.
4. Canonicalized mutation fingerprints across REST/sync defaults and transport metadata. Purchase lost-response sync replay returns original ID. Added direct composite-FK/posted-row SQL tests and independent stock/receivable/payable reconciliation.
5. Added distinct-key final-unit sale concurrency and competing debt collection tests. Both prove one successful effect, never negative stock/debt.
6. Added real browser lost-sale-response test: actual commit, aborted response, local queue survives reload, duplicate sync, one SQL sale. Fixed 390px report overflow and disabled chart animations for deterministic evidence.
7. Added durable owner-scoped pending request IDs for manual financial forms (`src/lib/client.ts`); explicit POS/purchase outbox IDs remain authoritative. Real expense response-loss/reload test proves one -0.30 ledger entry and same ID replay. Failed local storage prevents transmission, not untracked posting.
8. Replaced residual monetary display floating arithmetic in sales/receipt/reports/debts/supplier/cash views; draft validation prevents excess-precision render exceptions and rejects excess discount rather than silently changing it. Removed misleading expense/net-profit wording and duplicate minus sign. Fractional UI browser regression passes.
9. Hardened backup permissions/atomic file completion/space-safe retention and restored atomic restore invocation. Shell syntax passes; actual backup/restore remains blocked by missing client tools. RLS helper no longer provisions predictable production role credentials.
10. Separated Render migration-owner and runtime URLs; corrected Docker workflow and removed unsupported consignment/cold-offline claims. CI restricted-role browser fixture explicitly uses the isolated HTTP preview flag; hosted CI and deployment were not executed.
11. Sanitized email/seed/bootstrap error logs; invalid sync numeric input becomes a durable input conflict rather than perpetual retry. No production credentials were printed, persisted in source, or used.
12. Final local checks: **56/56 Vitest (7 files, zero skips), 27/27 Playwright**, typecheck/lint/build PASS, production audit zero. Full audit remains five high development-only advisories. Repeated browser tests initially exhausted persisted rate buckets; only guarded local test buckets were reset, not the security mechanism.
13. Final restart/outage proof: exact complete-row hashes/counts of **14 tables**, **14 sales** unchanged after actual PostgreSQL + Next restarts. DB down: health503/login500 sanitized. Recovery: health200. This is not backup restoration proof.
14. Consolidated durable findings, results, release gates, operational guidance and changed-file inventory. Final synthetic screenshots copied from passing run; traces/secrets/generated databases excluded from Git.

### Next execution sequence
- Provision isolated staging/tooling and SMTP sink; run actual dump/restore, container/managed-host startup and hosted CI.
- Compile/test Flutter and execute two-account/device offline acceptance.
- Resolve accounting allocation/reversal/consignment scope, historical invoice reconciliation, large-catalog pagination/totals and concurrent plan-limit enforcement.
- Safely address development dependency chain; run full regressions after further changes; reassess readiness only with new evidence.

No commit/push/production deployment is required to preserve this workspace's changes; none is claimed in this log.
