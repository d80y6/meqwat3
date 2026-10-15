import { createHash } from "node:crypto";
import { hasPermission, type Permission } from "./permissions";
import { db } from "@/db";
import {
  tenants, products, customers, suppliers, purchases, purchaseItems, sales, saleItems,
  payments, inventoryMovements, financialTransactions, shifts, cashRegisters,
  processedMutations, tenantCounters, subscriptions, plans, auditLogs,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "./api";
import { toCents, fromCents, mulQtyPrice, toMilliQty, fromMilliQty, addQty, subQty, roundRatio } from "./money";
import { withTenantTx, type Tx } from "./tx";

export { withTenantTx } from "./tx";
export type { Tx } from "./tx";

export interface Ctx {
  tenantId: string;
  userId: string;
  role: string;
}

/** Serialize postings per tenant. Conservative correctness-first locking also
 * orders shifts, balances and stock consistently, avoiding lock-order deadlocks.
 * Idempotency is tenant + actor + operation + canonical request, not just a key. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([k,v]) => v !== undefined && v !== null && k !== "source" && k !== "_queueOwner")
    .sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function operation<T extends object>(ctx: Ctx, input: object,
  permission: Permission, kind: string, fn: (tx: Tx) => Promise<T>): Promise<T & { duplicated?: boolean }> {
  if (!hasPermission(ctx.role, permission)) throw new ApiError("ليست لديك صلاحية", 403, "FORBIDDEN");
  const key = (input as { clientMutationId?: string | null }).clientMutationId;
  if (key != null && (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(key))) throw new ApiError("معرّف العملية غير صالح");
  const fingerprint = createHash("sha256").update(canonical({ actor: ctx.userId, kind, input })).digest("hex");
  return withTenantTx(ctx, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ctx.tenantId}, 0))`);
    await assertTenantWritable(ctx.tenantId, tx);
    if (key) {
      const [prior] = await tx.select().from(processedMutations).where(and(
        eq(processedMutations.tenantId, ctx.tenantId), eq(processedMutations.clientMutationId, key)));
      if (prior) {
        const stored = prior.result as { fingerprint?: string; value?: T };
        if (stored.fingerprint !== fingerprint || !stored.value) throw new ApiError("معرّف العملية مستخدم لطلب مختلف", 409, "IDEMPOTENCY_CONFLICT");
        return { ...stored.value, duplicated: true };
      }
    }
    const result = await fn(tx);
    if (key) await tx.insert(processedMutations).values({ tenantId: ctx.tenantId,
      clientMutationId: key, entityType: kind, entityId: String((result as {id?: string}).id ?? ctx.tenantId),
      result: { fingerprint, value: result } });
    // Financial audit must commit or roll back with its posting.
    await tx.insert(auditLogs).values({ tenantId: ctx.tenantId, userId: ctx.userId,
      action: kind, entityType: kind, metadata: { mutationId: key ?? null, result } });
    return result;
  });
}

async function lockShift(tx: Tx, ctx: Ctx, shiftId?: string | null) {
  if (!shiftId) return null;
  const [shift] = await tx.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.tenantId, ctx.tenantId))).for("update").limit(1);
  if (!shift || shift.status !== "open") throw new ApiError("الوردية غير مفتوحة", 409);
  if (ctx.role === "cashier" && shift.userId !== ctx.userId) throw new ApiError("الوردية تخص مستخدماً آخر", 403);
  return shift;
}

/** Subscription guard: suspended tenants and expired subscriptions cannot write. */
export async function assertTenantWritable(tenantId: string, connection: typeof db | Tx = db): Promise<void> {
  const [tenant] = await connection.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new ApiError("المتجر غير موجود", 404);
  if (tenant.status !== "active") throw new ApiError("اشتراك المتجر موقوف، تواصل مع إدارة المنصة", 403, "TENANT_SUSPENDED");
  const [sub] = await connection
    .select({ status: subscriptions.status, endsAt: subscriptions.endsAt })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);
  if (sub && (sub.status === "cancelled" || sub.status === "expired")) {
    throw new ApiError("انتهى اشتراك المتجر، جدّد الاشتراك للمتابعة", 403, "SUBSCRIPTION_EXPIRED");
  }
  if (sub?.endsAt && sub.endsAt < new Date()) {
    throw new ApiError("انتهى اشتراك المتجر، جدّد الاشتراك للمتابعة", 403, "SUBSCRIPTION_EXPIRED");
  }
}

/* ---------------------------------- SALES --------------------------------- */
export interface SaleItemInput { productId: string; qty: string | number; unitPrice?: string | number }
export interface CreateSaleInput {
  customerId?: string | null;
  shiftId?: string | null;
  registerId?: string | null;
  items: SaleItemInput[];
  discount?: string | number;
  paidAmount?: string | number;
  notes?: string;
  source?: string;
  clientMutationId?: string | null;
}

export interface SaleResult {
  id: string; invoiceNo: number; totalAmount: string; paidAmount: string;
  creditAmount: string; paymentMethod: string; status: string; duplicated?: boolean;
}

export async function createSale(ctx: Ctx, input: CreateSaleInput): Promise<SaleResult> {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new ApiError("أضف صنفاً واحداً على الأقل إلى الفاتورة");
  return await operation(ctx, input, "pos:use", "sale.create", async (tx) => {
    await lockShift(tx, ctx, input.shiftId);

      // Lock & validate products (tenant-scoped, prevents cross-tenant refs).
      const productIds = [...new Set(input.items.map((i) => i.productId))].sort();
      const lockedProducts = new Map<string, typeof products.$inferSelect>();
      for (const pid of productIds) {
        const [p] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, pid), eq(products.tenantId, ctx.tenantId)))
          .for("update")
          .limit(1);
        if (!p) throw new ApiError("أحد الأصناف غير موجود أو لا ينتمي لمتجرك", 404);
        if (!p.isActive) throw new ApiError(`الصنف «${p.name}» موقوف عن البيع`);
        lockedProducts.set(pid, p);
      }

      // Aggregate quantities per product for stock checks.
      const wanted = new Map<string, number>();
      for (const item of input.items) {
        const q = toMilliQty(item.qty);
        if (q <= 0) throw new ApiError("كمية البيع يجب أن تكون أكبر من صفر");
        wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + q);
      }
      for (const [pid, q] of wanted) {
        const p = lockedProducts.get(pid)!;
        if (p.trackStock && toMilliQty(p.stockQty) < q) {
          throw new ApiError(`المخزون غير كافٍ لصنف «${p.name}»: المتاح ${p.stockQty} ${p.unit}`);
        }
      }

      // Server-side totals — never trust client-computed amounts.
      let totalCents = 0;
      const lines = input.items.map((item) => {
        const p = lockedProducts.get(item.productId)!;
        const unitPrice = item.unitPrice !== undefined && item.unitPrice !== "" ? String(item.unitPrice) : p.salePrice;
        if (toCents(unitPrice) < 0) throw new ApiError("سعر البيع غير صالح");
        const lineTotal = mulQtyPrice(item.qty, unitPrice);
        totalCents += toCents(lineTotal);
        return { product: p, qty: fromMilliQty(toMilliQty(item.qty)), unitPrice: fromCents(toCents(unitPrice)), total: lineTotal };
      });
      const discountCents = toCents(input.discount ?? 0);
      if (discountCents < 0 || discountCents > totalCents) throw new ApiError("قيمة الخصم غير صالحة");
      const netCents = totalCents - discountCents;
      const paidCents =
        input.paidAmount === undefined || input.paidAmount === null || input.paidAmount === ""
          ? netCents
          : toCents(input.paidAmount);
      if (paidCents < 0 || paidCents > netCents) throw new ApiError("المبلغ المدفوع أكبر من صافي الفاتورة");
      const creditCents = netCents - paidCents;

      let customer: typeof customers.$inferSelect | null = null;
      if (input.customerId) {
        const [c] = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
          .for("update")
          .limit(1);
        if (!c || !c.isActive) throw new ApiError("العميل غير موجود أو موقوف", 404);
        customer = c;
      }
      if (creditCents > 0) {
        if (!customer) throw new ApiError("البيع بالآجل يتطلب اختيار عميل");
        const limit = toCents(customer.creditLimit);
        if (limit > 0 && toCents(customer.balance) + creditCents > limit) {
          throw new ApiError(`تجاوز العميل حد الائتمان المسموح (${customer.creditLimit})`);
        }
      }



      if (input.registerId) {
        const [register] = await tx.select().from(cashRegisters).where(and(eq(cashRegisters.id, input.registerId), eq(cashRegisters.tenantId, ctx.tenantId)));
        if (!register) throw new ApiError("الصندوق غير موجود", 404);
        const shift = await lockShift(tx, ctx, input.shiftId);
        if (shift && shift.registerId !== register.id) throw new ApiError("الصندوق لا يطابق الوردية");
      }

      // Sequential invoice number per tenant (row locked by upsert).
      const [counter] = await tx
        .insert(tenantCounters)
        .values({ tenantId: ctx.tenantId, lastInvoiceNo: 1 })
        .onConflictDoUpdate({
          target: tenantCounters.tenantId,
          set: { lastInvoiceNo: sql`${tenantCounters.lastInvoiceNo} + 1` },
        })
        .returning();
      const invoiceNo = counter.lastInvoiceNo;

      const paymentMethod = creditCents === 0 ? "cash" : paidCents === 0 ? "credit" : "mixed";
      const [sale] = await tx
        .insert(sales)
        .values({
          tenantId: ctx.tenantId,
          invoiceNo,
          customerId: customer?.id ?? null,
          userId: ctx.userId,
          shiftId: input.shiftId ?? null,
          registerId: input.registerId ?? null,
          totalAmount: fromCents(totalCents),
          discount: fromCents(discountCents),
          paidAmount: fromCents(paidCents),
          creditAmount: fromCents(creditCents),
          paymentMethod,
          notes: input.notes ?? null,
          source: input.source ?? "web",
          clientMutationId: input.clientMutationId ?? null,
        })
        .returning();

      for (const line of lines) {
        await tx.insert(saleItems).values({
          saleId: sale.id, tenantId: ctx.tenantId, productId: line.product.id,
          qty: line.qty, unitPrice: line.unitPrice, costPrice: line.product.costPrice, total: line.total,
        });
        if (line.product.trackStock) {
          const newStock = subQty(line.product.stockQty, line.qty);
          await tx.update(products).set({ stockQty: newStock, updatedAt: new Date() }).where(eq(products.id, line.product.id));
          line.product.stockQty = newStock;
          await tx.insert(inventoryMovements).values({
            tenantId: ctx.tenantId, productId: line.product.id, type: "sale",
            qty: fromMilliQty(-toMilliQty(line.qty)), balanceAfter: newStock,
            unitCost: line.product.costPrice, refType: "sale", refId: sale.id, userId: ctx.userId,
          });
        }
      }

      if (paidCents > 0) {
        await tx.insert(payments).values({
          tenantId: ctx.tenantId, kind: "sale_payment", customerId: customer?.id ?? null,
          saleId: sale.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
          amount: fromCents(paidCents), method: "cash",
        });
        await tx.insert(financialTransactions).values({
          tenantId: ctx.tenantId, type: "sale_cash", amount: fromCents(paidCents),
          refType: "sale", refId: sale.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
          description: `بيع فاتورة #${invoiceNo}`,
        });
      }
      if (creditCents > 0 && customer) {
        await tx
          .update(customers)
          .set({ balance: fromCents(toCents(customer.balance) + creditCents) })
          .where(eq(customers.id, customer.id));
      }

      const result = { id: sale.id, invoiceNo, totalAmount: sale.totalAmount, paidAmount: sale.paidAmount, creditAmount: sale.creditAmount, paymentMethod, status: sale.status };
      return result;
    });

}

/* ------------------------------- SALE RETURNS ------------------------------ */
export interface ReturnInput {
  clientMutationId?: string | null;
  items: { saleItemId: string; qty: string | number; restock: boolean }[];
  refundMethod: "cash" | "debt";
  shiftId?: string | null;
  notes?: string;
}

export async function returnSaleItems(ctx: Ctx, saleId: string, input: ReturnInput) {
  return operation(ctx, { ...input, saleId }, "sales:return", "sale.return", async (tx) => {
    await lockShift(tx, ctx, input.shiftId);
    const [sale] = await tx
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.tenantId, ctx.tenantId)))
      .for("update")
      .limit(1);
    if (!sale) throw new ApiError("الفاتورة غير موجودة", 404);
    if (sale.status === "returned" || sale.status === "reversed") throw new ApiError("الفاتورة مرتجعة بالكامل مسبقاً");
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new ApiError("اختر صنفاً واحداً على الأقل للإرجاع");

    if (!["cash", "debt"].includes(input.refundMethod)) throw new ApiError("طريقة الإرجاع غير صالحة");
    const allLines = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id)).orderBy(saleItems.id);
    const grossCents = toCents(sale.totalAmount);
    const netCents = grossCents - toCents(sale.discount);
    const entitlements = new Map<string, number>();
    let gross = 0, allocated = 0;
    for (const line of allLines) {
      gross += toCents(line.total);
      const next = grossCents ? roundRatio(BigInt(gross) * BigInt(netCents), BigInt(grossCents)) : 0;
      entitlements.set(line.id, next - allocated); allocated = next;
    }
    let refundCents = 0;
    for (const item of input.items) {
      const [line] = await tx
        .select()
        .from(saleItems)
        .where(and(eq(saleItems.id, item.saleItemId), eq(saleItems.saleId, sale.id)))
        .for("update")
        .limit(1);
      if (!line) throw new ApiError("بند الفاتورة غير موجود", 404);
      const q = toMilliQty(item.qty);
      const remaining = toMilliQty(line.qty) - toMilliQty(line.returnedQty);
      if (q <= 0 || q > remaining) throw new ApiError("كمية الإرجاع أكبر من الكمية المباعة المتبقية");
      const entitlement = entitlements.get(line.id)!;
      const previous = toMilliQty(line.returnedQty);
      refundCents += roundRatio(BigInt(previous + q) * BigInt(entitlement), BigInt(toMilliQty(line.qty)))
        - roundRatio(BigInt(previous) * BigInt(entitlement), BigInt(toMilliQty(line.qty)));
      await tx.update(saleItems).set({ returnedQty: fromMilliQty(toMilliQty(line.returnedQty) + q) }).where(eq(saleItems.id, line.id));

      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.tenantId, ctx.tenantId)))
        .for("update")
        .limit(1);
      if (product && product.trackStock) {
        if (item.restock) {
          const newStock = addQty(product.stockQty, item.qty);
          await tx.update(products).set({ stockQty: newStock, updatedAt: new Date() }).where(eq(products.id, product.id));
          await tx.insert(inventoryMovements).values({
            tenantId: ctx.tenantId, productId: product.id, type: "sale_return", qty: String(item.qty),
            balanceAfter: newStock, unitCost: product.costPrice, refType: "sale", refId: sale.id,
            userId: ctx.userId, notes: input.notes ?? "مرتجع بيع",
          });
        } else {
          // Receive then spoil the returned goods: net stock zero, but the
          // physical loss and its original cost remain visible in the ledger.
          await tx.insert(inventoryMovements).values([
            { tenantId: ctx.tenantId, productId: product.id, type: "sale_return", qty: fromMilliQty(q),
              balanceAfter: addQty(product.stockQty, item.qty), unitCost: line.costPrice,
              refType: "sale", refId: sale.id, userId: ctx.userId, notes: "استلام مرتجع تالف" },
            { tenantId: ctx.tenantId, productId: product.id, type: "spoilage", qty: fromMilliQty(-q),
              balanceAfter: product.stockQty, unitCost: line.costPrice,
              refType: "sale", refId: sale.id, userId: ctx.userId, notes: "هالك مرتجع غير قابل للبيع" },
          ]);
        }
      }
    }

    const [refunds] = await tx.select({ cash: sql<string>`coalesce(sum(case when ${payments.kind} = 'sale_refund' then ${payments.amount} else 0 end),0)`,
      debt: sql<string>`coalesce(sum(case when ${payments.kind} = 'sale_debt_refund' then ${payments.amount} else 0 end),0)` })
      .from(payments).where(and(eq(payments.saleId, sale.id), eq(payments.tenantId, ctx.tenantId)));
    if (input.refundMethod === "cash") {
      if (refundCents > toCents(sale.paidAmount) - toCents(refunds.cash)) throw new ApiError("الإرجاع النقدي أكبر من المدفوع؛ استخدم تخفيض الدين");
      await tx.insert(financialTransactions).values({
        tenantId: ctx.tenantId, type: "sale_refund", amount: fromCents(-refundCents),
        refType: "sale", refId: sale.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
        description: `مرتجع فاتورة #${sale.invoiceNo}`,
      });
      await tx.insert(payments).values({
        tenantId: ctx.tenantId, kind: "sale_refund", customerId: sale.customerId, saleId: sale.id,
        shiftId: input.shiftId ?? null, userId: ctx.userId, amount: fromCents(refundCents), method: "cash",
      });
    } else {
      if (!sale.customerId) throw new ApiError("لا يمكن تخفيض دين لفاتورة بدون عميل");
      const [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, sale.customerId), eq(customers.tenantId, ctx.tenantId)))
        .for("update")
        .limit(1);
      if (!customer) throw new ApiError("العميل غير موجود", 404);
      if (refundCents > toCents(customer.balance) || refundCents > toCents(sale.creditAmount) - toCents(refunds.debt)) throw new ApiError("الإرجاع أكبر من الدين المتبقي؛ يلزم تسوية موثقة");
      const newBalance = toCents(customer.balance) - refundCents;
      await tx.insert(payments).values({ tenantId: ctx.tenantId, kind: "sale_debt_refund", saleId: sale.id,
        customerId: customer.id, userId: ctx.userId, amount: fromCents(refundCents), method: "credit" });
      await tx.update(customers).set({ balance: fromCents(newBalance) }).where(eq(customers.id, customer.id));
    }

    const newReturned = toCents(sale.returnedAmount) + refundCents;
    const remainingLines = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const fullyReturned = remainingLines.every(l => toMilliQty(l.qty) === toMilliQty(l.returnedQty));
    await tx
      .update(sales)
      .set({ returnedAmount: fromCents(newReturned), status: fullyReturned ? "returned" : "partially_returned" })
      .where(eq(sales.id, sale.id));
    return { id: sale.id, refundAmount: fromCents(refundCents), status: fullyReturned ? "returned" : "partially_returned" };
  });
}

/* -------------------------------- PURCHASES -------------------------------- */
export interface CreatePurchaseInput {
  supplierId: string;
  shiftId?: string | null;
  items: { productId: string; qty: string | number; unitCost?: string | number }[];
  paidAmount?: string | number;
  notes?: string;
  source?: string;
  clientMutationId?: string | null;
}

export interface PurchaseResult {
  id: string; totalAmount: string; paidAmount: string; liability: string; duplicated?: boolean;
}

export async function createPurchase(ctx: Ctx, input: CreatePurchaseInput): Promise<PurchaseResult> {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new ApiError("أضف صنفاً واحداً على الأقل إلى فاتورة الشراء");
  return await operation(ctx, input, "purchases:manage", "purchase.create", async (tx) => {
    await lockShift(tx, ctx, input.shiftId);

      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, ctx.tenantId)))
        .for("update")
        .limit(1);
      if (!supplier || !supplier.isActive) throw new ApiError("المورّد غير موجود أو موقوف", 404);

      if (new Set(input.items.map(i => i.productId)).size !== input.items.length) throw new ApiError("ادمج بنود الصنف المكرر قبل الشراء");
      let totalCents = 0;
      const lines: { product: typeof products.$inferSelect; qty: string; unitCost: string; total: string }[] = [];
      for (const item of input.items) {
        const [p] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, item.productId), eq(products.tenantId, ctx.tenantId)))
          .for("update")
          .limit(1);
        if (!p) throw new ApiError("أحد الأصناف غير موجود أو لا ينتمي لمتجرك", 404);
        if (toMilliQty(item.qty) <= 0) throw new ApiError("كمية الشراء يجب أن تكون أكبر من صفر");
        const unitCost = item.unitCost !== undefined && item.unitCost !== "" ? String(item.unitCost) : p.costPrice;
        if (toCents(unitCost) < 0) throw new ApiError("تكلفة الشراء غير صالحة");
        const total = mulQtyPrice(item.qty, unitCost);
        totalCents += toCents(total);
        lines.push({ product: p, qty: fromMilliQty(toMilliQty(item.qty)), unitCost: fromCents(toCents(unitCost)), total });
      }
      const paidCents = toCents(input.paidAmount ?? 0);
      if (paidCents < 0 || paidCents > totalCents) throw new ApiError("المبلغ المدفوع للمورّد أكبر من إجمالي الشراء");
      const liabilityCents = totalCents - paidCents;

      const [purchase] = await tx
        .insert(purchases)
        .values({
          tenantId: ctx.tenantId, supplierId: supplier.id, userId: ctx.userId,
          shiftId: input.shiftId ?? null, totalAmount: fromCents(totalCents),
          paidAmount: fromCents(paidCents), notes: input.notes ?? null,
          source: input.source ?? "web", clientMutationId: input.clientMutationId ?? null,
        })
        .returning();

      for (const line of lines) {
        await tx.insert(purchaseItems).values({
          purchaseId: purchase.id, tenantId: ctx.tenantId, productId: line.product.id,
          qty: line.qty, unitCost: line.unitCost, total: line.total,
        });
        if (line.product.trackStock) {
          const newStock = addQty(line.product.stockQty, line.qty);
          // Weighted moving average cost keeps COGS/margins honest.
          const oldQtyMilli = toMilliQty(line.product.stockQty);
          const newQtyMilli = oldQtyMilli + toMilliQty(line.qty);
          let avgCost = line.product.costPrice;
          if (newQtyMilli > 0) {
            const totalCostCents =
              roundRatio(BigInt(oldQtyMilli) * BigInt(toCents(line.product.costPrice)), 1000n) +
              toCents(mulQtyPrice(line.qty, line.unitCost));
            avgCost = fromCents(roundRatio(BigInt(totalCostCents) * 1000n, BigInt(newQtyMilli)));
          }
          await tx.update(products).set({ stockQty: newStock, costPrice: avgCost, updatedAt: new Date() }).where(eq(products.id, line.product.id));
          line.product.stockQty = newStock;
          await tx.insert(inventoryMovements).values({
            tenantId: ctx.tenantId, productId: line.product.id, type: "purchase", qty: line.qty,
            balanceAfter: newStock, unitCost: line.unitCost, refType: "purchase", refId: purchase.id, userId: ctx.userId,
          });
        }
      }

      if (liabilityCents > 0) {
        await tx.update(suppliers).set({ balance: fromCents(toCents(supplier.balance) + liabilityCents) }).where(eq(suppliers.id, supplier.id));
      }
      if (paidCents > 0) {
        await tx.insert(payments).values({
          tenantId: ctx.tenantId, kind: "supplier_payment", supplierId: supplier.id, purchaseId: purchase.id,
          shiftId: input.shiftId ?? null, userId: ctx.userId, amount: fromCents(paidCents), method: "cash",
        });
        await tx.insert(financialTransactions).values({
          tenantId: ctx.tenantId, type: "purchase_cash", amount: fromCents(-paidCents),
          refType: "purchase", refId: purchase.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
          description: `شراء من ${supplier.name}`,
        });
      }

      const result: PurchaseResult = { id: purchase.id, totalAmount: fromCents(totalCents), paidAmount: fromCents(paidCents), liability: fromCents(liabilityCents) };
      return result;
    });

}

/* --------------------------------- PAYMENTS -------------------------------- */
export interface PaymentResult {
  id: string; newBalance: string; duplicated?: boolean;
}

export async function recordPayment(
  ctx: Ctx,
  input: { kind: "customer_payment" | "supplier_payment"; customerId?: string; supplierId?: string; amount: string | number; method?: string; shiftId?: string | null; notes?: string; clientMutationId?: string | null; source?: string },
): Promise<PaymentResult> {
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new ApiError("مبلغ السداد يجب أن يكون أكبر من صفر");
  return await operation(ctx, input, "payments:manage", "payment.create", async (tx) => {
    if (!["customer_payment", "supplier_payment"].includes(input.kind)) throw new ApiError("نوع السداد غير صالح");
    if (!["cash", "transfer"].includes(input.method ?? "cash")) throw new ApiError("طريقة السداد غير صالحة");
    await lockShift(tx, ctx, input.shiftId);

      let result: PaymentResult;
      if (input.kind === "customer_payment") {
        if (!input.customerId) throw new ApiError("اختر العميل");
        const [customer] = await tx
          .select()
          .from(customers)
          .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
          .for("update")
          .limit(1);
        if (!customer) throw new ApiError("العميل غير موجود", 404);
        if (amountCents > toCents(customer.balance)) throw new ApiError("مبلغ السداد أكبر من دين العميل الحالي");
        const newBalance = fromCents(toCents(customer.balance) - amountCents);
        await tx.update(customers).set({ balance: newBalance }).where(eq(customers.id, customer.id));
        const [payment] = await tx.insert(payments).values({
          tenantId: ctx.tenantId, kind: input.kind, customerId: customer.id, userId: ctx.userId,
          amount: fromCents(amountCents), method: input.method ?? "cash", shiftId: input.shiftId ?? null,
          notes: input.notes ?? null, clientMutationId: input.clientMutationId ?? null, source: input.source ?? "web",
        }).returning();
        if ((input.method ?? "cash") === "cash") await tx.insert(financialTransactions).values({
          tenantId: ctx.tenantId, type: "customer_payment", amount: fromCents(amountCents),
          refType: "payment", refId: payment.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
          description: `تحصيل دين من ${customer.name}`,
        });
        result = { id: payment.id, newBalance };
      } else {
        if (!input.supplierId) throw new ApiError("اختر المورّد");
        const [supplier] = await tx
          .select()
          .from(suppliers)
          .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, ctx.tenantId)))
          .for("update")
          .limit(1);
        if (!supplier || !supplier.isActive) throw new ApiError("المورّد غير موجود أو موقوف", 404);
        if (amountCents > toCents(supplier.balance)) throw new ApiError("مبلغ السداد أكبر من المستحق للمورّد");
        const newBalance = fromCents(toCents(supplier.balance) - amountCents);
        await tx.update(suppliers).set({ balance: newBalance }).where(eq(suppliers.id, supplier.id));
        const [payment] = await tx.insert(payments).values({
          tenantId: ctx.tenantId, kind: input.kind, supplierId: supplier.id, userId: ctx.userId,
          amount: fromCents(amountCents), method: input.method ?? "cash", shiftId: input.shiftId ?? null,
          notes: input.notes ?? null, clientMutationId: input.clientMutationId ?? null, source: input.source ?? "web",
        }).returning();
        if ((input.method ?? "cash") === "cash") await tx.insert(financialTransactions).values({
          tenantId: ctx.tenantId, type: "supplier_payment", amount: fromCents(-amountCents),
          refType: "payment", refId: payment.id, shiftId: input.shiftId ?? null, userId: ctx.userId,
          description: `سداد للمورّد ${supplier.name}`,
        });
        result = { id: payment.id, newBalance };
      }
      return result;
    });

}

/* ------------------------------ STOCK ACTIONS ------------------------------ */
export async function recordStockAction(
  ctx: Ctx,
  input: { clientMutationId?: string | null; productId: string; type: "spoilage" | "adjustment"; qty: string | number; notes?: string },
) {
  return operation(ctx, input, "inventory:manage", "stock.create", async (tx) => {
    if (!["spoilage", "adjustment"].includes(input.type)) throw new ApiError("نوع حركة غير صالح");
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.tenantId, ctx.tenantId)))
      .for("update")
      .limit(1);
    if (!product) throw new ApiError("الصنف غير موجود", 404);
    const q = toMilliQty(input.qty);
    if (input.type === "spoilage") {
      if (q <= 0) throw new ApiError("كمية التالف يجب أن تكون أكبر من صفر");
      if (toMilliQty(product.stockQty) < q) throw new ApiError("كمية التالف أكبر من المخزون المتاح");
      const newStock = subQty(product.stockQty, input.qty);
      await tx.update(products).set({ stockQty: newStock, updatedAt: new Date() }).where(eq(products.id, product.id));
      await tx.insert(inventoryMovements).values({
        tenantId: ctx.tenantId, productId: product.id, type: "spoilage", qty: fromMilliQty(-q),
        balanceAfter: newStock, unitCost: product.costPrice, refType: "manual", userId: ctx.userId,
        notes: input.notes ?? "تالف / هالك يومي",
      });
      return { productId: product.id, newStock };
    }
    // adjustment: qty is the new counted quantity (physical count)
    if (q < 0) throw new ApiError("الكمية المعدودة غير صالحة");
    const delta = q - toMilliQty(product.stockQty);
    const newStock = fromMilliQty(q);
    await tx.update(products).set({ stockQty: newStock, updatedAt: new Date() }).where(eq(products.id, product.id));
    await tx.insert(inventoryMovements).values({
      tenantId: ctx.tenantId, productId: product.id, type: "adjustment", qty: fromMilliQty(delta),
      balanceAfter: newStock, unitCost: product.costPrice, refType: "manual", userId: ctx.userId,
      notes: input.notes ?? "جرد وتسوية مخزون",
    });
    return { productId: product.id, newStock };
  });
}

/* --------------------------------- EXPENSES -------------------------------- */
export async function createExpense(
  ctx: Ctx,
  input: { amount: string | number; description: string; shiftId?: string | null; category?: string; clientMutationId?: string | null },
): Promise<{ id: string; amount: string }> {
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new ApiError("مبلغ المصروف يجب أن يكون أكبر من صفر");
  if (!input.description?.trim()) throw new ApiError("وصف المصروف مطلوب");
  return await operation(ctx, input, "cash:manage", "expense.create", async (tx) => {
    await lockShift(tx, ctx, input.shiftId);



      const [row] = await tx
        .insert(financialTransactions)
        .values({
          tenantId: ctx.tenantId,
          type: "expense",
          amount: fromCents(-amountCents),
          refType: "manual",
          shiftId: input.shiftId ?? null,
          userId: ctx.userId,
          description: `${input.category ? `[${input.category}] ` : ""}${input.description.trim()}`,
        })
        .returning();

      const result = { id: row.id, amount: fromCents(amountCents) };
      return result;
    });

}

/* --------------------------- PURCHASE RETURNS --------------------------- */
export interface PurchaseReturnInput {
  clientMutationId?: string | null;
  items: { purchaseItemId: string; qty: string | number }[];
  refundMethod: "cash" | "debt";
  shiftId?: string | null;
  notes?: string;
}

export async function returnPurchaseItems(ctx: Ctx, purchaseId: string, input: PurchaseReturnInput) {
  return operation(ctx, { ...input, purchaseId }, "purchases:manage", "purchase.return", async (tx) => {
    await lockShift(tx, ctx, input.shiftId);
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.tenantId, ctx.tenantId)))
      .for("update")
      .limit(1);
    if (!purchase) throw new ApiError("فاتورة الشراء غير موجودة", 404);
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new ApiError("اختر بنداً واحداً على الأقل للإرجاع");

    if (!["cash", "debt"].includes(input.refundMethod)) throw new ApiError("طريقة الإرجاع غير صالحة");
    let refundCents = 0;
    for (const item of input.items) {
      const [line] = await tx
        .select()
        .from(purchaseItems)
        .where(and(eq(purchaseItems.id, item.purchaseItemId), eq(purchaseItems.purchaseId, purchase.id)))
        .for("update")
        .limit(1);
      if (!line) throw new ApiError("بند فاتورة الشراء غير موجود", 404);
      const q = toMilliQty(item.qty);
      const available = toMilliQty(line.qty) - toMilliQty(line.returnedQty);
      if (q <= 0 || q > available) throw new ApiError("كمية الإرجاع أكبر من الكمية المشتراة");
      const oldReturned = toMilliQty(line.returnedQty);
      refundCents += roundRatio(BigInt(oldReturned + q) * BigInt(toCents(line.total)), BigInt(toMilliQty(line.qty)))
        - roundRatio(BigInt(oldReturned) * BigInt(toCents(line.total)), BigInt(toMilliQty(line.qty)));
      await tx.update(purchaseItems).set({ returnedQty: fromMilliQty(oldReturned + q) }).where(eq(purchaseItems.id, line.id));

      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.tenantId, ctx.tenantId)))
        .for("update")
        .limit(1);
      if (product && product.trackStock) {
        if (toMilliQty(product.stockQty) < q) throw new ApiError(`المخزون غير كافٍ لمرتجع الصنف «${product.name}»`);
        const newStock = subQty(product.stockQty, item.qty);
        await tx.update(products).set({ stockQty: newStock, updatedAt: new Date() }).where(eq(products.id, product.id));
        await tx.insert(inventoryMovements).values({
          tenantId: ctx.tenantId,
          productId: product.id,
          type: "purchase_return",
          qty: fromMilliQty(-q),
          balanceAfter: newStock,
          unitCost: line.unitCost,
          refType: "purchase",
          refId: purchase.id,
          userId: ctx.userId,
          notes: input.notes ?? "مرتجع شراء",
        });
      }
    }



    // Adjust supplier liability / cash
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, purchase.supplierId), eq(suppliers.tenantId, ctx.tenantId)))
      .for("update")
      .limit(1);
    if (!supplier || !supplier.isActive) throw new ApiError("المورّد غير موجود أو موقوف", 404);

    const [refunds] = await tx.select({ cash: sql<string>`coalesce(sum(case when ${payments.kind} = 'supplier_refund' then ${payments.amount} else 0 end),0)`,
      debt: sql<string>`coalesce(sum(case when ${payments.kind} = 'supplier_debt_refund' then ${payments.amount} else 0 end),0)` })
      .from(payments).where(and(eq(payments.purchaseId, purchase.id), eq(payments.tenantId, ctx.tenantId)));
    if (input.refundMethod === "cash") {
      if (refundCents > toCents(purchase.paidAmount) - toCents(refunds.cash)) throw new ApiError("الإرجاع النقدي أكبر من المدفوع للمورّد");
      await tx.insert(financialTransactions).values({
        tenantId: ctx.tenantId,
        type: "supplier_payment",
        amount: fromCents(refundCents),
        refType: "purchase",
        refId: purchase.id,
        shiftId: input.shiftId ?? null,
        userId: ctx.userId,
        description: `مرتجع شراء من ${supplier.name}`,
      });
      await tx.insert(payments).values({
        tenantId: ctx.tenantId,
        kind: "supplier_refund",
        supplierId: supplier.id,
        purchaseId: purchase.id,
        shiftId: input.shiftId ?? null,
        userId: ctx.userId,
        amount: fromCents(refundCents),
        method: "cash",
        notes: input.notes ?? "مرتجع شراء نقدي",
      });
    } else {
      // Reduce what we owe the supplier
      if (refundCents > toCents(supplier.balance) || refundCents > toCents(purchase.totalAmount) - toCents(purchase.paidAmount) - toCents(refunds.debt)) throw new ApiError("الإرجاع أكبر من الدين المتبقي؛ يلزم تسوية موثقة");
      const newBalance = toCents(supplier.balance) - refundCents;
      await tx.insert(payments).values({ tenantId: ctx.tenantId, kind: "supplier_debt_refund", purchaseId: purchase.id,
        supplierId: supplier.id, userId: ctx.userId, amount: fromCents(refundCents), method: "credit" });
      await tx.update(suppliers).set({ balance: fromCents(newBalance) }).where(eq(suppliers.id, supplier.id));
    }

    return { id: purchase.id, refundAmount: fromCents(refundCents) };
  });
}

/* ---------------------------------- SHIFTS --------------------------------- */
export async function openShift(ctx: Ctx, input: { registerId: string; openingCash: string | number }) {
  return operation(ctx, input, "cash:manage", "shift.open", async (tx) => {
    if (toCents(input.openingCash) < 0) throw new ApiError("رصيد الافتتاح غير صالح");
    const [register] = await tx
      .select()
      .from(cashRegisters)
      .where(and(eq(cashRegisters.id, input.registerId), eq(cashRegisters.tenantId, ctx.tenantId)))
      .limit(1);
    if (!register) throw new ApiError("الصندوق غير موجود", 404);
    const [existing] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.registerId, register.id), eq(shifts.status, "open")))
      .limit(1);
    if (existing) throw new ApiError("توجد وردية مفتوحة على هذا الصندوق — أغلقها أولاً");
    const [shift] = await tx
      .insert(shifts)
      .values({ tenantId: ctx.tenantId, registerId: register.id, userId: ctx.userId, openingCash: fromCents(toCents(input.openingCash)) })
      .returning();
    return shift;
  });
}

export async function computeShiftExpected(tx: Tx, shift: typeof shifts.$inferSelect): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${financialTransactions.amount}),0)` })
    .from(financialTransactions)
    .where(eq(financialTransactions.shiftId, shift.id));
  return toCents(shift.openingCash) + toCents(row?.total ?? 0);
}

export async function closeShift(ctx: Ctx, shiftId: string, input: { countedCash: string | number; notes?: string }) {
  return operation(ctx, { ...input, shiftId }, "cash:manage", "shift.close", async (tx) => {
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.tenantId, ctx.tenantId)))
      .for("update")
      .limit(1);
    if (!shift) throw new ApiError("الوردية غير موجودة", 404);
    if (shift.status !== "open") throw new ApiError("الوردية مغلقة مسبقاً");
    const expectedCents = await computeShiftExpected(tx, shift);
    const countedCents = toCents(input.countedCash);
    if (countedCents < 0) throw new ApiError("النقد المعدود غير صالح");
    if (ctx.role === "cashier" && shift.userId !== ctx.userId) throw new ApiError("الوردية تخص مستخدماً آخر", 403);
    const [closed] = await tx
      .update(shifts)
      .set({
        status: "closed",
        countedCash: fromCents(countedCents),
        expectedCash: fromCents(expectedCents),
        difference: fromCents(countedCents - expectedCents),
        closedAt: new Date(),
        notes: input.notes ?? shift.notes,
      })
      .where(eq(shifts.id, shift.id))
      .returning();
    return closed;
  });
}

/** Plan limits helper used when creating users/products. */
export async function getTenantPlan(tenantId: string, connection: typeof db | Tx = db) {
  const [row] = await connection
    .select({ plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);
  return row?.plan ?? null;
}
