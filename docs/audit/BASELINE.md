# Independent baseline — 2026-10-14

Source: c00501ff025543174ae3fbb64ead8edb1e51515e, clean initial working tree on arena/6b6973be-meqwat3. Existing implementation preserved. No production connection or credentials used.

## Actual architecture
Next.js 16.2.6 / React 19.2.6, TypeScript, Tailwind 4, PostgreSQL via pg + Drizzle, bcrypt and jose cookie authentication. API route handlers delegate financial operations to src/lib/services.ts. Flutter/BLoC/SQLite client is separate. Web offline queue is localStorage. SMTP is optional; no external payment gateway exists. `transfer` is a recorded method, not a bank integration.

Read README, DECISIONS, env example, CI, Docker/Compose/Render, schema, RLS, tests, authentication, permissions, financial services, synchronization. No versioned schema migrations exist initially: deployment uses drizzle-kit push. PostgreSQL, Docker, Flutter and Chromium binaries are absent in this sandbox. Dependencies install using npm registry.

## Commands BEFORE remediation
- `npm ci`: PASS; 12 reported vulnerabilities (4 moderate, 7 high, 1 critical).
- `npx next typegen`: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: FAIL, 45 errors.
- `npx vitest run`: 12 PASS, 11 SKIPPED (integration and RLS lack DB configuration). This is NOT a persistence pass.
- `npm run build`: PASS.
- `npm audit --json`: FAIL (exit 1).
- Documented DB initialization/runtime/browser tests: initially BLOCKED by absent local database/browser; isolated tooling being provisioned.

Raw local command outputs: /home/user/audit-evidence/baseline-*.log (outside Git, sanitized summaries retained here). Initial discovery command ran from /home/user and git status reported not a repository; subsequent commands explicitly use the checkout.

Prior documentation's “A+ production-hardened” and verification claims are not accepted as independent evidence.
