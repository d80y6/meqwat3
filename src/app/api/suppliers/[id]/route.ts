import { db } from "@/db";
import { suppliers, purchases, payments } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

async function load(tenantId: string, id: string) {
  const [s] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .limit(1);
  if (!s) throw new ApiError("المورّد غير موجود", 404);
  return s;
}

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("suppliers:manage");
  const { id } = await params;
  const supplier = await load(user.tenantId, id);
  const [recentPurchases, recentPayments] = await Promise.all([
    db.select().from(purchases).where(and(eq(purchases.tenantId, user.tenantId), eq(purchases.supplierId, id))).orderBy(desc(purchases.purchaseDate)).limit(10),
    db.select().from(payments).where(and(eq(payments.tenantId, user.tenantId), eq(payments.supplierId, id))).orderBy(desc(payments.createdAt)).limit(10),
  ]);
  return ok({ supplier, recentPurchases, recentPayments });
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("suppliers:manage");
  const { id } = await params;
  await load(user.tenantId, id);
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "phone", "address", "notes"] as const) {
    if (body[key] !== undefined) patch[key] = body[key] === null ? null : String(body[key]);
  }
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  const [updated] = await db
    .update(suppliers)
    .set(patch)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, user.tenantId)))
    .returning();
  await audit(user, "supplier.update", "supplier", id);
  return ok(updated);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("suppliers:manage");
  const { id } = await params;
  const supplier = await load(user.tenantId, id);
  if (Number(supplier.balance) !== 0) throw new ApiError("لا يمكن حذف مورّد لديه مستحقات — عطّل الحساب بدلاً من ذلك");
  const [updated] = await db
    .update(suppliers)
    .set({ isActive: false })
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, user.tenantId)))
    .returning();
  await audit(user, "supplier.deactivate", "supplier", id);
  return ok(updated);
});
