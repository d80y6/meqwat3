import { suppliers, purchases, payments } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { withTenantTx, type Tx } from "@/lib/services";

export const dynamic = "force-dynamic";

async function load(tx: Tx, tenantId: string, id: string) {
  const [s] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .limit(1);
  if (!s) throw new ApiError("المورّد غير موجود", 404);
  return s;
}

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser();
  const { id } = await params;
  const data = await withTenantTx(user, async (tx) => {
    const supplier = await load(tx, user.tenantId, id);
    const [recentPurchases, recentPayments] = await Promise.all([
      tx.select().from(purchases).where(and(eq(purchases.tenantId, user.tenantId), eq(purchases.supplierId, id))).orderBy(desc(purchases.purchaseDate)).limit(10),
      tx.select().from(payments).where(and(eq(payments.tenantId, user.tenantId), eq(payments.supplierId, id))).orderBy(desc(payments.createdAt)).limit(10),
    ]);
    return { supplier, recentPurchases, recentPayments };
  });
  return ok(data);
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("suppliers:manage");
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "phone", "address", "notes"] as const) {
    if (body[key] !== undefined) patch[key] = body[key] === null ? null : String(body[key]);
  }
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  const updated = await withTenantTx(user, async (tx) => {
    await load(tx, user.tenantId, id);
    const [row] = await tx
      .update(suppliers)
      .set(patch)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, user.tenantId)))
      .returning();
    return row;
  });
  await audit(user, "supplier.update", "supplier", id);
  return ok(updated);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("suppliers:manage");
  const { id } = await params;
  const updated = await withTenantTx(user, async (tx) => {
    const supplier = await load(tx, user.tenantId, id);
    if (Number(supplier.balance) !== 0) throw new ApiError("لا يمكن حذف مورّد لديه مستحقات — عطّل الحساب بدلاً من ذلك");
    const [row] = await tx
      .update(suppliers)
      .set({ isActive: false })
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, user.tenantId)))
      .returning();
    return row;
  });
  await audit(user, "supplier.deactivate", "supplier", id);
  return ok(updated);
});
