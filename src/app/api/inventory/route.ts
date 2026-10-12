import { inventoryMovements, products } from "@/db/schema";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, recordStockAction, withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

/** Stock overview + movement ledger (daily stock & spoilage reporting source). */
export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const conds = [eq(inventoryMovements.tenantId, user.tenantId)];
  if (productId) conds.push(eq(inventoryMovements.productId, productId));
  if (type) conds.push(eq(inventoryMovements.type, type as typeof inventoryMovements.$inferSelect.type));
  if (from) conds.push(gte(inventoryMovements.createdAt, new Date(from)));
  if (to) conds.push(lte(inventoryMovements.createdAt, new Date(to)));
  const where = and(...conds);
  const day = url.searchParams.get("day");

  const { moves, stock, daily } = await withTenantTx(user, async (tx) => {
    const moves = await tx
      .select({ move: inventoryMovements, productName: products.name, unit: products.unit })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .where(where)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(limit)
      .offset(offset);
    const stock = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, user.tenantId), eq(products.isActive, true)))
      .orderBy(products.name);

    let daily: unknown[] = [];
    if (day) {
      const start = new Date(`${day}T00:00:00`);
      const end = new Date(`${day}T23:59:59.999`);
      daily = await tx
        .select({
          productId: inventoryMovements.productId,
          productName: products.name,
          unit: products.unit,
          purchased: sql<string>`coalesce(sum(case when ${inventoryMovements.type} in ('purchase','opening','sale_return') then ${inventoryMovements.qty} else 0 end),0)`,
          sold: sql<string>`coalesce(sum(case when ${inventoryMovements.type} = 'sale' then -${inventoryMovements.qty} else 0 end),0)`,
          spoiled: sql<string>`coalesce(sum(case when ${inventoryMovements.type} = 'spoilage' then -${inventoryMovements.qty} else 0 end),0)`,
          closing: sql<string>`(select balance_after from inventory_movements m2 where m2.product_id = ${inventoryMovements.productId} and m2.tenant_id = ${user.tenantId} and m2.created_at <= ${end.toISOString()} order by m2.created_at desc limit 1)`,
        })
        .from(inventoryMovements)
        .innerJoin(products, eq(inventoryMovements.productId, products.id))
        .where(and(eq(inventoryMovements.tenantId, user.tenantId), gte(inventoryMovements.createdAt, start), lte(inventoryMovements.createdAt, end)))
        .groupBy(inventoryMovements.productId, products.name, products.unit);
    }
    return { moves, stock, daily };
  });

  return ok({
    movements: moves.map((m) => ({ ...m.move, productName: m.productName, unit: m.unit })),
    stock,
    daily,
  });
});

/** Record spoilage (هالك) or a physical-count adjustment (جرد). */
export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("inventory:manage");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  if (!body?.productId) throw new ApiError("اختر الصنف");
  if (body.type !== "spoilage" && body.type !== "adjustment") throw new ApiError("نوع الحركة غير صالح");
  const result = await recordStockAction(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    { productId: body.productId, type: body.type, qty: body.qty, notes: body.notes },
  );
  await audit(user, `inventory.${body.type}`, "product", body.productId, { qty: body.qty });
  return ok(result, 201);
});
