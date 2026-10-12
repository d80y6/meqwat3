import { sales, saleItems, products, customers } from "@/db/schema";
import { and, eq, desc, count, gte, lte } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, createSale, withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("sales:view");
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const conds = [eq(sales.tenantId, user.tenantId)];
  const customerId = url.searchParams.get("customerId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (customerId) conds.push(eq(sales.customerId, customerId));
  if (from) conds.push(gte(sales.saleDate, new Date(from)));
  if (to) conds.push(lte(sales.saleDate, new Date(to)));
  const where = and(...conds);

  const { rows, total, items } = await withTenantTx(user, async (tx) => {
    const rows = await tx
      .select({ sale: sales, customerName: customers.name })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(where)
      .orderBy(desc(sales.saleDate))
      .limit(limit)
      .offset(offset);
    const total = await tx.select({ c: count() }).from(sales).where(where);
    const items = rows.length
      ? await tx
          .select({ item: saleItems, productName: products.name, unit: products.unit })
          .from(saleItems)
          .innerJoin(products, eq(saleItems.productId, products.id))
          .where(eq(saleItems.tenantId, user.tenantId))
      : [];
    return { rows, total, items };
  });

  const bySale = new Map<string, unknown[]>();
  for (const row of items) {
    if (!rows.some((r) => r.sale.id === row.item.saleId)) continue;
    const arr = bySale.get(row.item.saleId) ?? [];
    arr.push({ ...row.item, productName: row.productName, unit: row.unit });
    bySale.set(row.item.saleId, arr);
  }
  return ok({
    items: rows.map((r) => ({ ...r.sale, customerName: r.customerName, items: bySale.get(r.sale.id) ?? [] })),
    total: total[0]?.c ?? 0,
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("pos:use");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  if (!Array.isArray(body?.items) || body.items.length === 0) throw new ApiError("أضف صنفاً واحداً على الأقل");
  const result = await createSale(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    {
      customerId: body.customerId ?? null,
      shiftId: body.shiftId ?? null,
      registerId: body.registerId ?? null,
      items: body.items,
      discount: body.discount,
      paidAmount: body.paidAmount,
      notes: body.notes,
      source: body.source ?? "web",
      clientMutationId: body.clientMutationId ?? null,
    },
  );
  if (!result.duplicated) await audit(user, "sale.create", "sale", String(result.id), { invoiceNo: result.invoiceNo, total: result.totalAmount });
  return ok(result, result.duplicated ? 200 : 201);
});
