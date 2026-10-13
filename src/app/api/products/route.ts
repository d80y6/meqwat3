import { db } from "@/db";
import { products, inventoryMovements } from "@/db/schema";
import { and, eq, ilike, desc, count } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, escapeIlike, audit, ApiError } from "@/lib/api";
import { getTenantPlan, withTenantTx } from "@/lib/services";
import { toCents, toMilliQty, fromMilliQty } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset, search } = parsePagination(req);
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const conds = [eq(products.tenantId, user.tenantId)];
  if (search) conds.push(ilike(products.name, `%${escapeIlike(search)}%`));
  if (activeOnly) conds.push(eq(products.isActive, true));
  const [rows, total] = await Promise.all([
    db.select().from(products).where(and(...conds)).orderBy(desc(products.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(products).where(and(...conds)),
  ]);
  return ok({ items: rows, total: total[0]?.c ?? 0 });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("products:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم الصنف مطلوب");
  if (toCents(body?.salePrice) < 0 || toCents(body?.costPrice) < 0) throw new ApiError("الأسعار غير صالحة");

  const created = await withTenantTx(user, async (tx) => {
    const plan = await getTenantPlan(user.tenantId);
    if (plan) {
      const [c] = await tx.select({ c: count() }).from(products).where(eq(products.tenantId, user.tenantId));
      if ((c?.c ?? 0) >= plan.maxProducts) throw new ApiError(`وصلت إلى حد الأصناف في باقتك (${plan.maxProducts})`);
    }
    const openingQty = body?.openingQty !== undefined ? String(body.openingQty) : "0";
    if (toMilliQty(openingQty) < 0) throw new ApiError("كمية الافتتاح غير صالحة");
    const [product] = await tx
      .insert(products)
      .values({
        tenantId: user.tenantId,
        name,
        sku: body?.sku ? String(body.sku) : null,
        category: body?.category ? String(body.category) : "قات",
        unit: body?.unit ? String(body.unit) : "حزمة",
        costPrice: String(body?.costPrice ?? "0"),
        salePrice: String(body?.salePrice ?? "0"),
        stockQty: fromMilliQty(toMilliQty(openingQty)),
        lowStockThreshold: String(body?.lowStockThreshold ?? "5"),
        trackStock: body?.trackStock !== false,
      })
      .returning();
    if (toMilliQty(openingQty) > 0) {
      await tx.insert(inventoryMovements).values({
        tenantId: user.tenantId, productId: product.id, type: "opening", qty: openingQty,
        balanceAfter: product.stockQty, unitCost: product.costPrice, refType: "manual",
        userId: user.id, notes: "رصيد افتتاحي",
      });
    }
    return product;
  });
  await audit(user, "product.create", "product", created.id, { name });
  return ok(created, 201);
});
