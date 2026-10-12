import { sales, saleItems, products, financialTransactions, inventoryMovements } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ok, handler, requireTenantUser } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("reports:view");
  const tid = user.tenantId;
  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(now.getTime() - 30 * 86400_000);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : now;

  return withTenantTx(user, async (tx) => {
    const [salesSummary] = await tx
      .select({
        invoices: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${sales.totalAmount}),0)`,
        discounts: sql<string>`coalesce(sum(${sales.discount}),0)`,
        returns: sql<string>`coalesce(sum(${sales.returnedAmount}),0)`,
        cash: sql<string>`coalesce(sum(${sales.paidAmount}),0)`,
        credit: sql<string>`coalesce(sum(${sales.creditAmount}),0)`,
      })
      .from(sales)
      .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, from), lte(sales.saleDate, to)));

    const [cogsRow] = await tx
      .select({ cogs: sql<string>`coalesce(sum(si.qty * si.cost_price),0)` })
      .from(sql`sale_items si inner join sales s on s.id = si.sale_id`)
      .where(sql`si.tenant_id = ${tid} and s.sale_date >= ${from.toISOString()} and s.sale_date <= ${to.toISOString()}`);

    const topProducts = await tx
      .select({
        productId: saleItems.productId,
        name: products.name,
        qtySold: sql<string>`coalesce(sum(${saleItems.qty} - ${saleItems.returnedQty}),0)`,
        revenue: sql<string>`coalesce(sum(${saleItems.total}),0)`,
        profit: sql<string>`coalesce(sum((${saleItems.qty} - ${saleItems.returnedQty}) * (${saleItems.unitPrice} - ${saleItems.costPrice})),0)`,
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(and(eq(saleItems.tenantId, tid), gte(sales.saleDate, from), lte(sales.saleDate, to)))
      .groupBy(saleItems.productId, products.name)
      .orderBy(sql`sum(${saleItems.total}) desc`)
      .limit(10);

    const byPayment = await tx
      .select({ method: sales.paymentMethod, total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount}),0)`, count: sql<number>`count(*)::int` })
      .from(sales)
      .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, from), lte(sales.saleDate, to)))
      .groupBy(sales.paymentMethod);

    const [spoilage] = await tx
      .select({
        qty: sql<string>`coalesce(sum(-${inventoryMovements.qty}),0)`,
        value: sql<string>`coalesce(sum(-${inventoryMovements.qty} * coalesce(${inventoryMovements.unitCost},0)),0)`,
      })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.tenantId, tid), eq(inventoryMovements.type, "spoilage"), gte(inventoryMovements.createdAt, from), lte(inventoryMovements.createdAt, to)));

    const ledger = await tx
      .select({ type: financialTransactions.type, total: sql<string>`coalesce(sum(${financialTransactions.amount}),0)` })
      .from(financialTransactions)
      .where(and(eq(financialTransactions.tenantId, tid), gte(financialTransactions.createdAt, from), lte(financialTransactions.createdAt, to)))
      .groupBy(financialTransactions.type);

    const netRevenue = Number(salesSummary?.gross ?? 0) - Number(salesSummary?.discounts ?? 0) - Number(salesSummary?.returns ?? 0);
    return ok({
      range: { from, to },
      sales: salesSummary,
      cogs: cogsRow?.cogs ?? "0",
      grossProfit: (netRevenue - Number(cogsRow?.cogs ?? 0)).toFixed(2),
      topProducts,
      byPayment,
      spoilage,
      ledger,
    });
  });
});
