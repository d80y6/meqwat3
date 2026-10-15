import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../src/db";
import { tenants, users, products, customers, suppliers, cashRegisters } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createSale, createPurchase, recordPayment, openShift, closeShift, returnSaleItems, returnPurchaseItems, recordStockAction, createExpense, assertTenantWritable } from "../src/lib/services";

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
    // Only this suite's fixtures: never sweep other tenants by a broad prefix.
    const { saleItems, purchaseItems, inventoryMovements, financialTransactions, payments, sales, purchases, shifts, processedMutations, tenantCounters, subscriptions, auditLogs } = await import("../src/db/schema");
    const ids = [tenantA, tenantB].filter(Boolean);
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
  it("purchase duplicates and negative costs roll back rather than corrupt stock", async () => {
    const [before] = await db.select().from(products).where(eq(products.id, prodA));
    await expect(createPurchase(ctxA(), {supplierId:suppA, items:[{productId:prodA,qty:"1"},{productId:prodA,qty:"2"}]})).rejects.toThrow();
    await expect(createPurchase(ctxA(), {supplierId:suppA, items:[{productId:prodA,qty:"1",unitCost:"-1"}]})).rejects.toThrow();
    const [after] = await db.select().from(products).where(eq(products.id,prodA));
    expect(after.stockQty).toBe(before.stockQty);
  });

  it("serializes concurrent retries and binds keys to payload and operation", async () => {
    const input = {items:[{productId:prodA,qty:"1"}],clientMutationId:`parallel-${Date.now()}`};
    const [before] = await db.select().from(products).where(eq(products.id,prodA));
    const results = await Promise.all(Array.from({length:8},()=>createSale(ctxA(),input)));
    expect(new Set(results.map(r=>r.id)).size).toBe(1);
    expect(results.filter(r=>r.duplicated)).toHaveLength(7);
    const [after] = await db.select().from(products).where(eq(products.id,prodA));
    expect(Number(after.stockQty)).toBe(Number(before.stockQty)-1);
    await expect(createSale(ctxA(),{...input,paidAmount:"0",customerId:custA})).rejects.toThrow(/مختلف/);
    await expect(recordStockAction(ctxA(),{clientMutationId:input.clientMutationId,productId:prodA,type:"adjustment",qty:"1"})).rejects.toThrow(/مختلف/);
  });

  it("service authorization cannot be bypassed by sync or alternate callers", async () => {
    const cashier = {...ctxA(),role:"cashier"};
    await expect(createPurchase(cashier,{supplierId:suppA,items:[{productId:prodA,qty:"1"}]})).rejects.toMatchObject({status:403});
    await expect(recordPayment(cashier,{kind:"supplier_payment",supplierId:suppA,amount:"1"})).rejects.toMatchObject({status:403});
    await expect(recordStockAction(cashier,{productId:prodA,type:"adjustment",qty:"10"})).rejects.toMatchObject({status:403});
  });

  it("rejects foreign shifts across every cash-posting service", async () => {
    const [reg] = await db.insert(cashRegisters).values({tenantId:tenantB,name:"other"}).returning();
    const shift = await openShift(ctxB(),{registerId:reg.id,openingCash:"0"});
    await expect(createSale(ctxA(),{shiftId:shift.id,items:[{productId:prodA,qty:"1"}]})).rejects.toThrow();
    await expect(createPurchase(ctxA(),{shiftId:shift.id,supplierId:suppA,items:[{productId:prodA,qty:"1"}]})).rejects.toThrow();
    await expect(recordPayment(ctxA(),{shiftId:shift.id,kind:"supplier_payment",supplierId:suppA,amount:"1"})).rejects.toThrow();
    await expect(createExpense(ctxA(),{shiftId:shift.id,amount:"1",description:"x"})).rejects.toThrow();
    await expect(createSale(ctxA(),{registerId:reg.id,items:[{productId:prodA,qty:"1"}]})).rejects.toThrow();
  });

  it("one open shift, cash close/post race, and noncash settlement reconcile", async () => {
    const [reg] = await db.insert(cashRegisters).values({tenantId:tenantA,name:"race"}).returning();
    const opens = await Promise.allSettled([openShift(ctxA(),{registerId:reg.id,openingCash:"10"}),openShift(ctxA(),{registerId:reg.id,openingCash:"10"})]);
    expect(opens.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const shift = (opens.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openShift>>>).value;
    await recordPayment(ctxA(),{shiftId:shift.id,kind:"supplier_payment",supplierId:suppA,amount:"1",method:"transfer"});
    const [closing, posting] = await Promise.allSettled([closeShift(ctxA(),shift.id,{countedCash:"10"}),createExpense(ctxA(),{shiftId:shift.id,amount:"1",description:"race"})]);
    expect(closing.status).toBe("fulfilled");
    const {financialTransactions} = await import("../src/db/schema");
    const moves = await db.select().from(financialTransactions).where(eq(financialTransactions.shiftId,shift.id));
    if (closing.status === "fulfilled") expect(Number(closing.value.expectedCash)).toBe(10+moves.reduce((sum,r)=>sum+Number(r.amount),0));
    if(posting.status==="fulfilled") expect(moves).toHaveLength(1);
    await expect(createExpense(ctxA(),{shiftId:shift.id,amount:"1",description:"late"})).rejects.toThrow();
  });

  it("purchase return retains original document and retries once", async () => {
    const purchase = await createPurchase(ctxA(),{supplierId:suppA,paidAmount:"10",items:[{productId:prodA,qty:"2",unitCost:"5"}]});
    const {purchaseItems} = await import("../src/db/schema");
    const [line] = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId,purchase.id));
    const input = {items:[{purchaseItemId:line.id,qty:"1"}],refundMethod:"cash" as const,clientMutationId:`return-${Date.now()}`};
    expect((await returnPurchaseItems(ctxA(),purchase.id,input)).refundAmount).toBe("5.00");
    expect((await returnPurchaseItems(ctxA(),purchase.id,input)).duplicated).toBe(true);
    const [after] = await db.select().from(purchaseItems).where(eq(purchaseItems.id,line.id));
    expect(after.qty).toBe("2.000"); expect(after.total).toBe("10.00"); expect(after.returnedQty).toBe("1.000");
  });

  it("discounted fractional returns never over-refund and finish exactly", async () => {
    const sale=await createSale(ctxA(),{discount:"0.01",items:[{productId:prodA,qty:"3",unitPrice:"0.01"}]});
    const {saleItems,sales}=await import("../src/db/schema");
    const [line]=await db.select().from(saleItems).where(eq(saleItems.saleId,sale.id));
    let total=0;
    for(let i=0;i<3;i++) total+=Number((await returnSaleItems(ctxA(),sale.id,{items:[{saleItemId:line.id,qty:"1",restock:true}],refundMethod:"cash"})).refundAmount);
    expect(total).toBe(0.02);
    const [after]=await db.select().from(sales).where(eq(sales.id,sale.id));
    expect(after.returnedAmount).toBe("0.02"); expect(after.status).toBe("returned");
  });

  it("stock spoilage retries exactly once and expired trials cannot write", async () => {
    const input={productId:prodA,type:"spoilage" as const,qty:"1",clientMutationId:`stock-${Date.now()}`};
    const first=await recordStockAction(ctxA(),input);const again=await recordStockAction(ctxA(),input);
    expect(again.newStock).toBe(first.newStock);expect(again.duplicated).toBe(true);
    const {plans,subscriptions}=await import("../src/db/schema");
    const [plan]=await db.insert(plans).values({name:"audit-plan"}).returning();
    const [sub]=await db.insert(subscriptions).values({tenantId:tenantA,planId:plan.id,status:"trial",endsAt:new Date(0)}).returning();
    await expect(assertTenantWritable(tenantA)).rejects.toMatchObject({status:403});
    await db.delete(subscriptions).where(eq(subscriptions.id,sub.id));await db.delete(plans).where(eq(plans.id,plan.id));
  });

  it("password reset is hashed, single-use, and revokes all sessions atomically", async () => {
    const {issuePasswordReset,consumePasswordReset}=await import("../src/lib/password-reset");
    const {sessions,passwordResets}=await import("../src/db/schema");
    await db.insert(sessions).values({userId:userA,refreshTokenHash:`test-session-${Date.now()}`,expiresAt:new Date(Date.now()+60000)});
    const token=await issuePasswordReset(userA);
    const [stored]=await db.select().from(passwordResets).where(eq(passwordResets.userId,userA));
    expect(stored.tokenHash).not.toBe(token);expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const results=await Promise.allSettled([consumePasswordReset(token,"Reset-test-only-1234"),consumePasswordReset(token,"Reset-test-only-1234")]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const old=await db.select().from(sessions).where(eq(sessions.userId,userA));
    expect(old.every(s=>s.revokedAt!==null)).toBe(true);
    await expect(consumePasswordReset(token,"Reset-test-only-1234")).rejects.toThrow();
    const expired=await issuePasswordReset(userA);
    await db.update(passwordResets).set({expiresAt:new Date(0)}).where(eq(passwordResets.userId,userA));
    await expect(consumePasswordReset(expired,"Reset-test-only-1234")).rejects.toThrow();
  });

  it("damaged sale return has a zero net quantity but records physical spoilage",async()=>{
    const sale=await createSale(ctxA(),{items:[{productId:prodA,qty:"1"}]});
    const {saleItems,inventoryMovements}=await import("../src/db/schema");
    const [line]=await db.select().from(saleItems).where(eq(saleItems.saleId,sale.id));
    const [before]=await db.select().from(products).where(eq(products.id,prodA));
    await returnSaleItems(ctxA(),sale.id,{items:[{saleItemId:line.id,qty:"1",restock:false}],refundMethod:"cash"});
    const [after]=await db.select().from(products).where(eq(products.id,prodA));
    expect(after.stockQty).toBe(before.stockQty);
    const movements=await db.select().from(inventoryMovements).where(eq(inventoryMovements.refId,sale.id));
    expect(movements.find(m=>m.type==="spoilage")?.qty).toBe("-1.000");
    expect(movements.find(m=>m.type==="sale_return")?.qty).toBe("1.000");
  });


  it("concurrent over-collection admits one payment, never a negative balance",async()=>{
    const [customer]=await db.insert(customers).values({tenantId:tenantA,name:"concurrency",creditLimit:"100"}).returning();
    await createSale(ctxA(),{customerId:customer.id,paidAmount:"0",items:[{productId:prodA,qty:"1",unitPrice:"10"}]});
    const results=await Promise.allSettled([recordPayment(ctxA(),{kind:"customer_payment",customerId:customer.id,amount:"8"}),recordPayment(ctxA(),{kind:"customer_payment",customerId:customer.id,amount:"8"})]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const [after]=await db.select().from(customers).where(eq(customers.id,customer.id));expect(after.balance).toBe("2.00");
  });

  it("distinct concurrent sales cannot oversell the final unit",async()=>{
    const [product]=await db.insert(products).values({tenantId:tenantA,name:"last-unit",stockQty:"1",salePrice:"1"}).returning();
    const results=await Promise.allSettled([createSale(ctxA(),{items:[{productId:product.id,qty:"1"}]}),createSale(ctxA(),{items:[{productId:product.id,qty:"1"}]})]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const [after]=await db.select().from(products).where(eq(products.id,product.id));expect(after.stockQty).toBe("0.000");
  });

  it("independent SQL reconciliation matches stock, customer receivable and supplier payable",async()=>{
    const {pool}=await import("../src/db");
    const customer=(await pool.query(`select c.balance,
      coalesce((select sum(credit_amount) from sales where customer_id=c.id),0)
      -coalesce((select sum(amount) from payments where customer_id=c.id and kind in ('customer_payment','sale_debt_refund')),0) as derived
      from customers c where id=$1`,[custA])).rows[0];
    expect(Number(customer.balance)).toBe(Number(customer.derived));
    const supplier=(await pool.query(`select s.balance,
      coalesce((select sum(total_amount-paid_amount) from purchases where supplier_id=s.id),0)
      -coalesce((select sum(amount) from payments where supplier_id=s.id and ((kind='supplier_payment' and purchase_id is null) or kind='supplier_debt_refund')),0) as derived
      from suppliers s where id=$1`,[suppA])).rows[0];
    expect(Number(supplier.balance)).toBe(Number(supplier.derived));
    const stock=(await pool.query(`select p.stock_qty,10+coalesce((select sum(qty) from inventory_movements where product_id=p.id),0) as derived from products p where id=$1`,[prodA])).rows[0];
    expect(Number(stock.stock_qty)).toBe(Number(stock.derived));
  });

});
