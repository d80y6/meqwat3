import { toCents, fromCents } from "@/lib/money";
import { db } from "@/db";
import { sales, financialTransactions, inventoryMovements } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ok, handler, requireTenantUser, parseDateRange } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser("reports:view");
  const tid = user.tenantId;
  const { from, to } = parseDateRange(req);

  const [salesSummary] = await db
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

  const [cogsRow] = await db
    .select({ cogs: sql<string>`coalesce(round(sum((si.qty - si.returned_qty) * si.cost_price),2),0)` })
    .from(sql`sale_items si inner join sales s on s.id = si.sale_id`)
    .where(sql`si.tenant_id = ${tid} and s.sale_date >= ${from.toISOString()} and s.sale_date <= ${to.toISOString()}`);

  // Same cumulative-cent discount allocation used by the return service.
  const topResult = await db.execute(sql`
    with allocated as (
      select si.*, p.name,
        round(sum(si.total) over (partition by si.sale_id order by si.id) * (s.total_amount-s.discount) / nullif(s.total_amount,0), 2)
        - round((sum(si.total) over (partition by si.sale_id order by si.id) - si.total) * (s.total_amount-s.discount) / nullif(s.total_amount,0), 2) as net
      from sale_items si join sales s on s.id=si.sale_id join products p on p.id=si.product_id
      where si.tenant_id=${tid} and s.sale_date>=${from.toISOString()} and s.sale_date<=${to.toISOString()}
    ), remaining as (
      select *, coalesce(net-round(net*returned_qty/nullif(qty,0),2),0) as revenue,
        round((qty-returned_qty)*cost_price,2) as cost from allocated
    )
    select product_id as "productId", name, sum(qty-returned_qty)::text as "qtySold",
      sum(revenue)::text as revenue, sum(revenue-cost)::text as profit
    from remaining group by product_id,name order by sum(revenue) desc limit 10`);
  const topProducts = topResult.rows;

  const byPayment = await db
    .select({ method: sales.paymentMethod, total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount} - ${sales.returnedAmount}),0)`, count: sql<number>`count(*)::int` })
    .from(sales)
    .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, from), lte(sales.saleDate, to)))
    .groupBy(sales.paymentMethod);

  const [spoilage] = await db
    .select({
      qty: sql<string>`coalesce(sum(-${inventoryMovements.qty}),0)`,
      value: sql<string>`coalesce(round(sum(-${inventoryMovements.qty} * coalesce(${inventoryMovements.unitCost},0)),2),0)`,
    })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.tenantId, tid), eq(inventoryMovements.type, "spoilage"), gte(inventoryMovements.createdAt, from), lte(inventoryMovements.createdAt, to)));

  const ledger = await db
    .select({ type: financialTransactions.type, total: sql<string>`coalesce(sum(${financialTransactions.amount}),0)` })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.tenantId, tid), gte(financialTransactions.createdAt, from), lte(financialTransactions.createdAt, to)))
    .groupBy(financialTransactions.type);

  const netRevenue = toCents(salesSummary?.gross ?? 0) - toCents(salesSummary?.discounts ?? 0) - toCents(salesSummary?.returns ?? 0);
  return ok({
    range: { from, to },
    sales: salesSummary,
    cogs: cogsRow?.cogs ?? "0",
    grossProfit: fromCents(netRevenue - toCents(cogsRow?.cogs ?? 0)),
    topProducts,
    byPayment,
    spoilage,
    ledger,
  });
});
