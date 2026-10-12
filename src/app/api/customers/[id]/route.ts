import { customers, sales, payments } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { withTenantTx, type Tx } from "@/lib/services";

export const dynamic = "force-dynamic";

async function load(tx: Tx, tenantId: string, id: string) {
  const [c] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
    .limit(1);
  if (!c) throw new ApiError("العميل غير موجود", 404);
  return c;
}

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser();
  const { id } = await params;
  const data = await withTenantTx(user, async (tx) => {
    const customer = await load(tx, user.tenantId, id);
    const [recentSales, recentPayments] = await Promise.all([
      tx.select().from(sales).where(and(eq(sales.tenantId, user.tenantId), eq(sales.customerId, id))).orderBy(desc(sales.saleDate)).limit(10),
      tx.select().from(payments).where(and(eq(payments.tenantId, user.tenantId), eq(payments.customerId, id))).orderBy(desc(payments.createdAt)).limit(10),
    ]);
    return { customer, recentSales, recentPayments };
  });
  return ok(data);
});

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("customers:manage");
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "phone", "address", "notes"] as const) {
    if (body[key] !== undefined) patch[key] = body[key] === null ? null : String(body[key]);
  }
  if (body.creditLimit !== undefined) patch.creditLimit = String(body.creditLimit);
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  const updated = await withTenantTx(user, async (tx) => {
    await load(tx, user.tenantId, id);
    const [row] = await tx
      .update(customers)
      .set(patch)
      .where(and(eq(customers.id, id), eq(customers.tenantId, user.tenantId)))
      .returning();
    return row;
  });
  await audit(user, "customer.update", "customer", id);
  return ok(updated);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("customers:manage");
  const { id } = await params;
  const updated = await withTenantTx(user, async (tx) => {
    const customer = await load(tx, user.tenantId, id);
    if (Number(customer.balance) !== 0) throw new ApiError("لا يمكن حذف عميل لديه رصيد مستحق — عطّل الحساب بدلاً من ذلك");
    const [row] = await tx
      .update(customers)
      .set({ isActive: false })
      .where(and(eq(customers.id, id), eq(customers.tenantId, user.tenantId)))
      .returning();
    return row;
  });
  await audit(user, "customer.deactivate", "customer", id);
  return ok(updated);
});
