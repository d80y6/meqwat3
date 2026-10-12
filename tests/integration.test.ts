import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../src/db";
import { tenants, users, products, customers, suppliers, cashRegisters } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createSale, createPurchase, recordPayment, openShift, closeShift, returnSaleItems } from "../src/lib/services";

/**
 * Integration tests against the real PostgreSQL database.
 * Acceptance scenarios: idempotent retries, tenant isolation, transaction
 * rollback on oversell, balance reconciliation, shift reconciliation.
 * Requires DATABASE_URL (run `npx drizzle-kit push` + this suite locally/CI).
 */

const RUN = Boolean(process.env.DATABASE_URL);
const suite = RUN ? describe : describe.skip;

suite("Meqwat transactional core (real PostgreSQL)", () => {
  let tenantA: string, tenantB: string, userA: string, userB: string;
  let prodA: string, custA: string, suppA: string, regA: string;
  const ctxA = () => ({ tenantId: tenantA, userId: userA, role: "tenant_owner" });
  const ctxB = () => ({ tenantId: tenantB, userId: userB, role: "tenant_owner" });

  beforeAll(async () => {
    const [a] = await db.insert(tenants).values({ name: "متجر اختبار أ", slug: `test-a-${Date.now()}`, isDemo: true }).returning();
    const [b] = await db.insert(tenants).values({ name: "متجر اختبار ب", slug: `test-b-${Date.now()}`, isDemo: true }).returning();
    tenantA = a.id; tenantB = b.id;
    const [ua] = await db.insert(users).values({ tenantId: tenantA, name: "مالك أ", email: `a-${Date.now()}@test.ye`, passwordHash: "x", role: "tenant_owner" }).returning();
    const [ub] = await db.insert(users).values({ tenantId: tenantB, name: "مالك ب", email: `b-${Date.now()}@test.ye`, passwordHash: "x", role: "tenant_owner" }).returning();
    userA = ua.id; userB = ub.id;
    const [p] = await db.insert(products).values({ tenantId: tenantA, name: "قات اختبار", costPrice: "5000", salePrice: "8000", stockQty: "10" }).returning();
    prodA = p.id;
    const [c] = await db.insert(customers).values({ tenantId: tenantA, name: "عميل اختبار", creditLimit: "100000" }).returning();
    custA = c.id;
    const [s] = await db.insert(suppliers).values({ tenantId: tenantA, name: "مورّد اختبار" }).returning();
    suppA = s.id;
    const [r] = await db.insert(cashRegisters).values({ tenantId: tenantA, name: "صندوق اختبار" }).returning();
    regA = r.id;
  });

  afterAll(async () => {
    // Delete in FK dependency order (item rows reference products).
    // Sweep EVERY test tenant (slug prefix test-), so even a run that died
    // mid-suite can never leave orphaned tenants behind.
    const { saleItems, purchaseItems, inventoryMovements, financialTransactions, payments, sales, purchases, shifts, processedMutations, tenantCounters, subscriptions, auditLogs } = await import("../src/db/schema");
    const { like } = await import("drizzle-orm");
    const testTenants = await db.select({ id: tenants.id }).from(tenants).where(like(tenants.slug, "test-%"));
    const ids = [...new Set([tenantA, tenantB, ...testTenants.map((t) => t.id)])];
    for (const tid of ids) {
      await db.delete(saleItems).where(eq(saleItems.tenantId, tid));
      await db.delete(purchaseItems).where(eq(purchaseItems.tenantId, tid));
      await db.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tid));
      await db.delete(financialTransactions).where(eq(financialTransactions.tenantId, tid));
      await db.delete(payments).where(eq(payments.tenantId, tid));
      await db.delete(sales).where(eq(sales.tenantId, tid));
      await db.delete(purchases).where(eq(purchases.tenantId, tid));
      await db.delete(shifts).where(eq(shifts.tenantId, tid));
      await db.delete(processedMutations).where(eq(processedMutations.tenantId, tid));
      await db.delete(tenantCounters).where(eq(tenantCounters.tenantId, tid));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, tid));
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tid));
      await db.delete(products).where(eq(products.tenantId, tid));
      await db.delete(customers).where(eq(customers.tenantId, tid));
      await db.delete(suppliers).where(eq(suppliers.tenantId, tid));
      await db.delete(cashRegisters).where(eq(cashRegisters.tenantId, tid));
      await db.delete(users).where(eq(users.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
  });

  it("purchase increases stock and supplier liability; payment reduces it", async () => {
    const res = await createPurchase(ctxA(), { supplierId: suppA, paidAmount: "20000", items: [{ productId: prodA, qty: "5", unitCost: "5000" }] });
    expect(res.totalAmount).toBe("25000.00");
    expect(res.liability).toBe("5000.00");
    const [p] = await db.select().from(products).where(eq(products.id, prodA));
    expect(p.stockQty).toBe("15.000");
    const pay = await recordPayment(ctxA(), { kind: "supplier_payment", supplierId: suppA, amount: "5000" });
    expect(pay.newBalance).toBe("0.00");
    await expect(recordPayment(ctxA(), { kind: "supplier_payment", supplierId: suppA, amount: "1" })).rejects.toThrow();
  });

  it("sale is idempotent: retried mutation never double-charges stock or debt", async () => {
    const input = { customerId: custA, paidAmount: "8000", items: [{ productId: prodA, qty: "2" }], clientMutationId: `it-mut-${Date.now()}` };
    const first = await createSale(ctxA(), input);
    const second = await createSale(ctxA(), input);
    expect(second.duplicated).toBe(true);
    expect(second.id).toBe(first.id);
    const [p] = await db.select().from(products).where(eq(products.id, prodA));
    expect(p.stockQty).toBe("13.000"); // 15 - 2 exactly once
    const [c] = await db.select().from(customers).where(eq(customers.id, custA));
    expect(c.balance).toBe("8000.00"); // credit portion 16000-8000, charged once
  });

  it("oversell rolls back the whole transaction (no partial writes)", async () => {
    await expect(createSale(ctxA(), { items: [{ productId: prodA, qty: "9999" }] })).rejects.toThrow(/المخزون غير كافٍ/);
    const [p] = await db.select().from(products).where(eq(products.id, prodA));
    expect(p.stockQty).toBe("13.000");
  });

  it("cross-tenant product reference is rejected", async () => {
    await expect(createSale(ctxB(), { items: [{ productId: prodA, qty: "1" }] })).rejects.toThrow();
  });

  it("returns restock inventory and refund cash", async () => {
    const sale = await createSale(ctxA(), { items: [{ productId: prodA, qty: "1" }] });
    const { saleItems } = await import("../src/db/schema");
    const [line] = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
    const ret = await returnSaleItems(ctxA(), sale.id, { items: [{ saleItemId: line.id, qty: "1", restock: true }], refundMethod: "cash" });
    expect(ret.refundAmount).toBe("8000.00");
    expect(ret.status).toBe("returned");
    const [p] = await db.select().from(products).where(eq(products.id, prodA));
    expect(p.stockQty).toBe("13.000"); // 12 + 1 restocked
  });

  it("shift reconciliation: expected = opening + cash movements", async () => {
    const shift = await openShift(ctxA(), { registerId: regA, openingCash: "10000" });
    await createSale(ctxA(), { shiftId: shift.id, items: [{ productId: prodA, qty: "1" }] }); // +8000 cash
    const closed = await closeShift(ctxA(), shift.id, { countedCash: "17500" });
    expect(closed.expectedCash).toBe("18000.00");
    expect(closed.difference).toBe("-500.00");
    await expect(closeShift(ctxA(), shift.id, { countedCash: "18000" })).rejects.toThrow(/مغلقة/);
  });

  it("credit limit is enforced", async () => {
    // Top up stock so the stock check passes and the credit check is what fires.
    await createPurchase(ctxA(), { supplierId: suppA, paidAmount: "0", items: [{ productId: prodA, qty: "50", unitCost: "5000" }] });
    // 40 x 16000 = 640000 credit >> remaining limit (100000 - 8000)
    await expect(
      createSale(ctxA(), { customerId: custA, paidAmount: "0", items: [{ productId: prodA, qty: "40", unitPrice: "16000" }] }),
    ).rejects.toThrow(/حد الائتمان/);
  });
});
