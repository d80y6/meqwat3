import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Tenant-scoped audit trail (platform admins pass ?all=1 handled by their own tenant=null scope check). */
export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("audit:view");
  const { limit, offset } = parsePagination(req);
  const rows = await db
    .select({ log: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.tenantId, user.tenantId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);
  return ok({ items: rows.map((r) => ({ ...r.log, userName: r.userName })) });
});
