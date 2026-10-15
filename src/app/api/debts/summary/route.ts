import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";
import { sql } from "drizzle-orm";
import { handler, ok, requireTenantUser } from "@/lib/api";

export const dynamic = "force-dynamic";

// One statement/snapshot across all accounts, including disabled accounts.
// List pagination/search must never determine financial totals.
export const GET = handler(async () => {
  const user = await requireTenantUser("payments:manage");
  const result = await db.execute(sql`
    select
      (select coalesce(sum(balance),0)::text from ${customers} where tenant_id=${user.tenantId} and balance>0) as receivables,
      (select coalesce(sum(balance),0)::text from ${suppliers} where tenant_id=${user.tenantId} and balance>0) as payables
  `);
  return ok(result.rows[0]);
});
