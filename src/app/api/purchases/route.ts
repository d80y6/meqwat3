import { subMoney } from "@/lib/money";
import { db } from "@/db";
import { purchases, purchaseItems, products, suppliers } from "@/db/schema";
import { and, eq, desc, count, inArray } from "drizzle-orm";
import { requireMutationId, ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, createPurchase } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("purchases:manage");
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const conds = [eq(purchases.tenantId, user.tenantId)];
  const supplierId = url.searchParams.get("supplierId");
  if (supplierId) conds.push(eq(purchases.supplierId, supplierId));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db
      .select({ purchase: purchases, supplierName: suppliers.name })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(purchases.purchaseDate), purchases.id)
      .limit(limit)
      .offset(offset),
    db.select({ c: count() }).from(purchases).where(where),
  ]);
  const ids = rows.map((r) => r.purchase.id);
  const items = ids.length
    ? await db
        .select({ item: purchaseItems, productName: products.name, unit: products.unit })
        .from(purchaseItems)
        .innerJoin(products, eq(purchaseItems.productId, products.id))
        .where(and(eq(purchaseItems.tenantId, user.tenantId), inArray(purchaseItems.purchaseId, ids)))
    : [];
  const byPurchase = new Map<string, unknown[]>();
  for (const row of items) {
    if (!ids.includes(row.item.purchaseId)) continue;
    const arr = byPurchase.get(row.item.purchaseId) ?? [];
    arr.push({ ...row.item, productName: row.productName, unit: row.unit });
    byPurchase.set(row.item.purchaseId, arr);
  }
  return ok({
    items: rows.map((r) => ({
      ...r.purchase,
      supplierName: r.supplierName,
      remaining: subMoney(r.purchase.totalAmount, r.purchase.paidAmount),
      items: byPurchase.get(r.purchase.id) ?? [],
    })),
    total: total[0]?.c ?? 0,
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("purchases:manage");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  requireMutationId(body);
  if (!body?.supplierId) throw new ApiError("اختر المورّد");
  if (!Array.isArray(body?.items) || body.items.length === 0) throw new ApiError("أضف صنفاً واحداً على الأقل");
  const result = await createPurchase(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    {
      supplierId: body.supplierId,
      shiftId: body.shiftId ?? null,
      items: body.items,
      paidAmount: body.paidAmount,
      notes: body.notes,
      source: body.source ?? "web",
      clientMutationId: body.clientMutationId ?? null,
    },
  );
  if (!result.duplicated) await audit(user, "purchase.create", "purchase", String(result.id), { total: result.totalAmount });
  return ok(result, result.duplicated ? 200 : 201);
});
