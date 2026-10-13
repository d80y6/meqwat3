/**
 * Canonical transaction helper — re-exported by `src/lib/services.ts` for
 * backward-compat so both import paths work but there is a single implementation.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run work inside a transaction with PostgreSQL RLS session variables set:
 *   app.tenant_id — tenant scope ('' when platform-level)
 *   app.is_admin  — 'true' for platform-level contexts (tenantId = null)
 * Policies live in db/rls.sql and bind when the app connects as the
 * non-superuser `meqwat_app` role; with a superuser connection they are
 * inert and the service-layer tenant filters remain the enforcement.
 */
export async function withTenantTx<T>(
  ctx: { tenantId: string | null },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId ?? ""}, true)`);
    await tx.execute(sql`select set_config('app.is_admin', ${ctx.tenantId ? "false" : "true"}, true)`);
    return fn(tx);
  });
}
