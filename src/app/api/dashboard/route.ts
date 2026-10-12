import { sales, products, customers, suppliers, shifts, financialTransactions } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { ok, handler, requireTenantUser } from "@/lib/api";
import { withTenantTx } from "@/lib/services";
import { toCents, fromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

function dayStart(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

export const GET = handler(async () => {
  const user = await requireTenantUser();
  const tid = user.tenantId;
  const today = dayStart(0);
  const weekAgo = dayStart(6);

  // All tenant tables are RLS-protected: reads run in a tenant-scoped tx.
  return withTenantTx(user, async (tx) => {
    const [todaySales] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount} - ${sales.returnedAmount}),0)`,
        cash: sql<string>`coalesce(sum(${sales.paidAmount}),0)`,
        credit: sql<string>`coalesce(sum(${sales.creditAmount}),0)`,
      })
      .from(sales)
      .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, today)));

    const [receivables] = await tx
      .select({ total: sql<string>`coalesce(sum(${customers.balance}),0)`, count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(eq(customers.tenantId, tid), sql`${customers.balance} > 0`));
    const [payables] = await tx
      .select({ total: sql<string>`coalesce(sum(${suppliers.balance}),0)`, count: sql<number>`count(*)::int` })
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tid), sql`${suppliers.balance} > 0`));

    const lowStock = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tid), eq(products.isActive, true), eq(products.trackStock, true), sql`${products.stockQty} <= ${products.lowStockThreshold}`))
      .limit(8);

    const openShifts = await tx
      .select({ shift: shifts })
      .from(shifts)
      .where(and(eq(shifts.tenantId, tid), eq(shifts.status, "open")));

    const daily = await tx
      .select({
        day: sql<string>`to_char(date_trunc('day', ${sales.saleDate}), 'YYYY-MM-DD')`,
        total: sql<string>`coalesce(sum(${sales.totalAmount} - ${sales.discount}),0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, weekAgo)))
      .groupBy(sql`date_trunc('day', ${sales.saleDate})`)
      .orderBy(sql`date_trunc('day', ${sales.saleDate})`);

    const [profit] = await tx
      .select({ revenue: sql<string>`coalesce(sum((${sales.totalAmount} - ${sales.discount})),0)` })
      .from(sales)
      .where(and(eq(sales.tenantId, tid), gte(sales.saleDate, today)));
    const [cogs] = await tx
      .select({ total: sql<string>`coalesce(sum(si.qty * si.cost_price),0)` })
      .from(sql`sale_items si inner join sales s on s.id = si.sale_id`)
      .where(sql`si.tenant_id = ${tid} and s.sale_date >= ${today.toISOString()}`);

    const [cashInDrawer] = await tx
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
});
