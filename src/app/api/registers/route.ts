import { cashRegisters, shifts } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireTenantUser();
  const data = await withTenantTx(user, async (tx) => {
    const registers = await tx
      .select()
      .from(cashRegisters)
      .where(and(eq(cashRegisters.tenantId, user.tenantId), eq(cashRegisters.isActive, true)));
    const openShifts = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.tenantId, user.tenantId), eq(shifts.status, "open")))
      .orderBy(desc(shifts.openedAt));
    return { registers, openShifts };
  });
  return ok(data);
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("cash:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم الصندوق مطلوب");
  const created = await withTenantTx(user, async (tx) => {
    const [row] = await tx.insert(cashRegisters).values({ tenantId: user.tenantId, name }).returning();
    return row;
  });
  await audit(user, "register.create", "cash_register", created.id, { name });
  return ok(created, 201);
});
