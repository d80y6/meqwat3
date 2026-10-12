import { auditLogs, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Tenant-scoped audit trail. */
export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("audit:view");
  const { limit, offset } = parsePagination(req);
  const rows = await withTenantTx(user, async (tx) =>
    tx
      .select({ log: auditLogs, userName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(eq(auditLogs.tenantId, user.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
  );
  return ok({ items: rows.map((r) => ({ ...r.log, userName: r.userName })) });
});
