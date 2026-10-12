import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import {
  plans, tenants, users, products, customers, suppliers, cashRegisters, subscriptions,
} from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { createSale, createPurchase, recordPayment, openShift, recordStockAction } from "../lib/services";

/**
 * Development/demo seed. All tenants created here are flagged is_demo=true
 * and must never be confused with production data. Idempotent: safe to re-run.
 */

const seedPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const sdb = drizzle(seedPool);

async function main() {
  await sdb.execute(sql`select set_config('app.is_admin', 'true', false)`);
  const [existingAdmin] = await sdb.select().from(users).where(eq(users.email, "admin@meqwat.app")).limit(1);
  if (existingAdmin) {
    console.log("✓ Seed already applied — skipping.");
    await seedPool.end();
    return;
  }

  console.log("Seeding Meqwat demo environment…");

  // Plans
  const [basic, pro, ent] = await sdb
    .insert(plans)
    .values([
      { name: "الأساسية", nameEn: "Basic", priceMonthly: "15000", maxUsers: 3, maxProducts: 50, maxBranches: 1, features: ["نقطة بيع", "مخزون وهالك", "ديون العملاء"] },
      { name: "الاحترافية", nameEn: "Professional", priceMonthly: "35000", maxUsers: 10, maxProducts: 300, maxBranches: 3, features: ["كل مزايا الأساسية", "تقارير أرباح متقدمة", "عمل دون اتصال", "ورديات متعددة"] },
      { name: "المؤسسات", nameEn: "Enterprise", priceMonthly: "80000", maxUsers: 50, maxProducts: 5000, maxBranches: 20, features: ["كل مزايا الاحترافية", "فروع غير محدودة عملياً", "دعم ذو أولوية", "سجل تدقيق موسّع"] },
    ])
    .returning();
  void basic; void ent;

  // Platform admin (no tenant)
  await sdb.insert(users).values({
    tenantId: null, name: "مدير المنصة", email: "admin@meqwat.app",
    passwordHash: await hashPassword("Admin@1234"), role: "platform_admin",
  });

  // ---- Demo tenant 1: متجر البركة (صنعاء) ----
  const [baraka] = await sdb.insert(tenants).values({
    name: "متجر البركة للقات", slug: "baraka-demo", ownerName: "محمد الحداد",
    phone: "777123456", city: "صنعاء", isDemo: true,
  }).returning();
  await sdb.insert(subscriptions).values({
    tenantId: baraka.id, planId: pro.id, status: "active",
    endsAt: new Date(Date.now() + 90 * 86400_000),
  });

  const [owner] = await sdb.insert(users).values([
    { tenantId: baraka.id, name: "محمد الحداد", email: "owner@baraka.ye", phone: "777123456", passwordHash: await hashPassword("Owner@1234"), role: "tenant_owner" },
    { tenantId: baraka.id, name: "أحمد الشيباني", email: "manager@baraka.ye", phone: "733987654", passwordHash: await hashPassword("Manager@1234"), role: "manager" },
    { tenantId: baraka.id, name: "خالد العمري", email: "cashier@baraka.ye", phone: "711555222", passwordHash: await hashPassword("Cashier@1234"), role: "cashier" },
  ]).returning();
  const ctx = { tenantId: baraka.id, userId: owner.id, role: "tenant_owner" };

  const [register] = await sdb.insert(cashRegisters).values([
    { tenantId: baraka.id, name: "الصندوق الرئيسي" },
    { tenantId: baraka.id, name: "صندوق الفرع — حدة" },
  ]).returning();

  const productData = [
    { name: "قات همداني فاخر", sku: "HMD-01", costPrice: "8500", salePrice: "12000", openingQty: "40" },
    { name: "قات بلدي صبري", sku: "BLD-02", costPrice: "5200", salePrice: "8000", openingQty: "65" },
    { name: "قات عماري", sku: "AMR-03", costPrice: "3800", salePrice: "6000", openingQty: "80" },
    { name: "قات شامي", sku: "SHM-04", costPrice: "2900", salePrice: "4500", openingQty: "55" },
    { name: "قات صعدي ممتاز", sku: "SAD-05", costPrice: "11000", salePrice: "15000", openingQty: "25" },
    { name: "قات أرحب", sku: "ARH-06", costPrice: "4600", salePrice: "7000", openingQty: "3" },
  ];
  const prods: Record<string, typeof products.$inferSelect> = {};
  for (const p of productData) {
    const [created] = await sdb.insert(products).values({ tenantId: baraka.id, ...p, stockQty: "0" }).returning();
    prods[p.sku] = created;
  }

  const [sup1, sup2] = await sdb.insert(suppliers).values([
    { tenantId: baraka.id, name: "مزارع أبو ناصر — همدان", phone: "777444555", address: "همدان، صنعاء" },
    { tenantId: baraka.id, name: "وكالة الشامي للقات", phone: "733666777", address: "سوق الملح، صنعاء القديمة" },
  ]).returning();

  const custRows = await sdb.insert(customers).values([
    { tenantId: baraka.id, name: "عبدالله المطري", phone: "777888999", creditLimit: "200000" },
    { tenantId: baraka.id, name: "سالم باجابر", phone: "733222111", creditLimit: "100000" },
    { tenantId: baraka.id, name: "محل الياسمين للقات", phone: "711333444", creditLimit: "500000" },
    { tenantId: baraka.id, name: "ناصر القباطي", phone: "777000111", creditLimit: "50000" },
  ]).returning();

  // Purchases (stock-in through the real transactional service)
  await createPurchase(ctx, {
    supplierId: sup1.id, paidAmount: "300000",
    items: [
      { productId: prods["HMD-01"].id, qty: "40", unitCost: "8500" },
      { productId: prods["SAD-05"].id, qty: "25", unitCost: "11000" },
    ],
  });
  await createPurchase(ctx, {
    supplierId: sup2.id, paidAmount: "0",
    items: [
      { productId: prods["BLD-02"].id, qty: "65", unitCost: "5200" },
      { productId: prods["AMR-03"].id, qty: "80", unitCost: "3800" },
      { productId: prods["SHM-04"].id, qty: "55", unitCost: "2900" },
      { productId: prods["ARH-06"].id, qty: "3", unitCost: "4600" },
    ],
  });

  // Open today's shift and run demo sales
  const shift = await openShift(ctx, { registerId: register.id, openingCash: "50000" });
  await createSale(ctx, { shiftId: shift.id, registerId: register.id, paidAmount: "24000", items: [{ productId: prods["HMD-01"].id, qty: "2" }] });
  await createSale(ctx, {
    shiftId: shift.id, registerId: register.id, customerId: custRows[0].id, paidAmount: "10000",
    items: [{ productId: prods["BLD-02"].id, qty: "3" }, { productId: prods["AMR-03"].id, qty: "1" }],
  });
  await createSale(ctx, {
    shiftId: shift.id, registerId: register.id, customerId: custRows[2].id, paidAmount: "0",
    items: [{ productId: prods["SAD-05"].id, qty: "4" }],
  });
  await createSale(ctx, { shiftId: shift.id, registerId: register.id, paidAmount: "9000", items: [{ productId: prods["SHM-04"].id, qty: "2" }] });
  await recordPayment(ctx, { kind: "customer_payment", customerId: custRows[0].id, amount: "5000", shiftId: shift.id });
  await recordPayment(ctx, { kind: "supplier_payment", supplierId: sup2.id, amount: "100000" });
  // Spoilage: yesterday's unsold qat written off
  await recordStockAction(ctx, { productId: prods["SHM-04"].id, type: "spoilage", qty: "4", notes: "هالك قات الأمس — ذابل" });

  // ---- Demo tenant 2: قات النور (عدن) — proves tenant isolation ----
  const [noor] = await sdb.insert(tenants).values({
    name: "قات النور", slug: "noor-demo", ownerName: "فاطمة باعشن",
    phone: "734555666", city: "عدن", isDemo: true,
  }).returning();
  await sdb.insert(subscriptions).values({ tenantId: noor.id, planId: basic.id, status: "trial", endsAt: new Date(Date.now() + 14 * 86400_000) });
  const [noorOwner] = await sdb.insert(users).values({
    tenantId: noor.id, name: "فاطمة باعشن", email: "owner@noor.ye",
    passwordHash: await hashPassword("Owner@1234"), role: "tenant_owner",
  }).returning();
  await sdb.insert(cashRegisters).values({ tenantId: noor.id, name: "الصندوق الرئيسي" });
  const [noorProd] = await sdb.insert(products).values({
    tenantId: noor.id, name: "قات يافعي", sku: "YFC-01", costPrice: "6000", salePrice: "9500", stockQty: "30",
  }).returning();
  void noorOwner; void noorProd;

  // A pending subscription request for the admin queue
  const { subscriptionRequests } = await import("./schema");
  await sdb.insert(subscriptionRequests).values({
    businessName: "متجر السلام للقات", ownerName: "عمر باحكيم", email: "salam@shop.ye",
    phone: "777999888", city: "تعز", planId: basic.id, notes: "محل في سوق الجملة، نحتاج صندوقين",
  });

  console.log("✓ Seeded: platform admin + 2 demo tenants (البركة / النور), products, purchases, sales, debts, open shift.");
  console.log("  Logins: admin@meqwat.app/Admin@1234 · owner@baraka.ye/Owner@1234 · cashier@baraka.ye/Cashier@1234 · owner@noor.ye/Owner@1234");
}

main()
  .then(async () => { await seedPool.end(); process.exit(0); })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
