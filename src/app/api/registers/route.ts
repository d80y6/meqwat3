import { db } from "@/db";
import { cashRegisters, shifts } from "@/db/schema";
import { and, eq, count, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { getTenantPlan } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireTenantUser();
  const registers = await db
    .select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.tenantId, user.tenantId), eq(cashRegisters.isActive, true)));
  const open = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.tenantId, user.tenantId), eq(shifts.status, "open")))
    .orderBy(desc(shifts.openedAt));
  return ok({ registers, openShifts: open });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("cash:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم الصندوق مطلوب");
  const plan = await getTenantPlan(user.tenantId);
  if (plan) {
    const [{ c }] = await db
      .select({ c: count() })
      .from(cashRegisters)
      .where(and(eq(cashRegisters.tenantId, user.tenantId), eq(cashRegisters.isActive, true)));
    if (c >= Number(plan.maxBranches)) throw new ApiError(`الحد الأقصى للصناديق حسب الخطة (${plan.maxBranches})`, 409);
  }
  const [created] = await db
    .insert(cashRegisters)
    .values({ tenantId: user.tenantId, name })
    .returning();
  await audit(user, "register.create", "cash_register", created.id, { name });
  return ok(created, 201);
});
