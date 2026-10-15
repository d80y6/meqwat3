import { toCents, toMilliQty } from "@/lib/money";
import { db } from "@/db";
import { products } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

async function loadTenantProduct(tenantId: string, id: string) {
  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!p) throw new ApiError("الصنف غير موجود", 404);
  return p;
}

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("products:manage");
  const { id } = await params;
  const product = await loadTenantProduct(user.tenantId, id);
  const body = await req.json();
  if (toMilliQty(product.stockQty) !== 0 &&
      ((body.costPrice !== undefined && toCents(body.costPrice) !== toCents(product.costPrice)) ||
       (body.trackStock !== undefined && body.trackStock !== product.trackStock))) {
    throw new ApiError("لا يمكن تغيير تكلفة أو تتبع مخزون قائم — استخدم حركة شراء أو تسوية موثقة");
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["name", "sku", "category", "unit"] as const) {
    if (body[key] !== undefined) patch[key] = String(body[key]);
  }
  for (const key of ["costPrice", "salePrice", "lowStockThreshold"] as const) {
    if (body[key] !== undefined) patch[key] = String(body[key]);
  }
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (body.trackStock !== undefined) patch.trackStock = Boolean(body.trackStock);
  const [updated] = await db
    .update(products)
    .set(patch)
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .returning();
  await audit(user, "product.update", "product", id);
  return ok(updated);
});

export const DELETE = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("products:manage");
  const { id } = await params;
  await loadTenantProduct(user.tenantId, id);
  // Soft-delete: products referenced by sales history must never disappear.
  const [updated] = await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.tenantId, user.tenantId)))
    .returning();
  await audit(user, "product.deactivate", "product", id);
  return ok(updated);
});
