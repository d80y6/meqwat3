import { businessDayStart } from "@/lib/business-date";
import { db } from "@/db";
import { sales, products, customers, suppliers, shifts, financialTransactions } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { ok, handler, requireTenantUser } from "@/lib/api";
import { toCents, fromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireTenantUser();
  const tid = user.tenantId;
  const today = businessDayStart(0);
  const weekAgo = businessDayStart(6);

  const [todaySales] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount} - ${sales.returnedAmount}),0)`,
      cash: sql<string>`coalesce(sum(${sales.paidAmount}),0)`,
      credit: sql<string>`coalesce(sum(${sales.creditAmount}),0)`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, today)));

  const [receivables] = await db
    .select({ total: sql<string>`coalesce(sum(${customers.balance}),0)`, count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(eq(customers.tenantId, tid), sql`${customers.balance} > 0`));
  const [payables] = await db
    .select({ total: sql<string>`coalesce(sum(${suppliers.balance}),0)`, count: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(and(eq(suppliers.tenantId, tid), sql`${suppliers.balance} > 0`));

  const lowStock = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tid), eq(products.isActive, true), eq(products.trackStock, true), sql`${products.stockQty} <= ${products.lowStockThreshold}`))
    .limit(8);

  const openShifts = await db
    .select({ shift: shifts })
    .from(shifts)
    .where(and(eq(shifts.tenantId, tid), eq(shifts.status, "open")));

  // Sales per day for the last 7 days (for the chart).
  const daily = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${sales.saleDate} at time zone 'Asia/Aden'), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount} - ${sales.returnedAmount}),0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, weekAgo)))
    .groupBy(sql`date_trunc('day', ${sales.saleDate} at time zone 'Asia/Aden')`)
    .orderBy(sql`date_trunc('day', ${sales.saleDate} at time zone 'Asia/Aden')`);

  // Gross profit today: revenue - COGS of items sold today.
  const [profit] = await db
    .select({
      revenue: sql<string>`coalesce(sum((${sales.totalAmount} - ${sales.discount} - ${sales.returnedAmount})),0)`,
    })
    .from(sales)
    .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, today)));
  const [cogs] = await db
    .select({ total: sql<string>`coalesce(round(sum((si.qty - si.returned_qty) * si.cost_price),2),0)` })
    .from(sql`sale_items si inner join sales s on s.id = si.sale_id`)
    .where(sql`si.tenant_id = ${tid} and s.sale_date >= ${today.toISOString()}`);

  const [cashInDrawer] = await db
    .select({ total: sql<string>`coalesce(sum(${financialTransactions.amount}),0)` })
    .from(financialTransactions)
    .where(eq(financialTransactions.tenantId, tid));

  return ok({
    today: {
      salesCount: todaySales?.count ?? 0,
      salesTotal: todaySales?.total ?? "0",
      cashCollected: todaySales?.cash ?? "0",
      creditGiven: todaySales?.credit ?? "0",
      grossProfit: fromCents(toCents(profit?.revenue ?? 0) - toCents(cogs?.total ?? 0)),
    },
    receivables: { total: receivables?.total ?? "0", debtors: receivables?.count ?? 0 },
    payables: { total: payables?.total ?? "0", creditors: payables?.count ?? 0 },
    cashLedgerBalance: cashInDrawer?.total ?? "0",
    lowStock,
    openShifts: openShifts.map((s) => s.shift),
    dailySales: daily,
  });
});
