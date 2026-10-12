import "dotenv/config";
import { db } from "./index";
import { plans, users } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { withTenantTx } from "../lib/services";

/**
 * Production bootstrap — run ONCE on a fresh production database:
 *   npx drizzle-kit push && npx tsx src/db/bootstrap.ts
 *
 * Creates the plan catalog and the first platform administrator from
 * environment variables. Contains NO demo tenants or sample transactions.
 * Demo data lives only in src/db/seed.ts and is flagged is_demo=true.
 */
async function main() {
  const existingPlans = await db.select({ id: plans.id }).from(plans).limit(1);
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      { name: "الأساسية", nameEn: "Basic", priceMonthly: "15000", maxUsers: 3, maxProducts: 50, maxBranches: 1, features: ["نقطة بيع", "مخزون وهالك", "ديون العملاء"] },
      { name: "الاحترافية", nameEn: "Professional", priceMonthly: "35000", maxUsers: 10, maxProducts: 300, maxBranches: 3, features: ["كل مزايا الأساسية", "تقارير أرباح متقدمة", "عمل دون اتصال", "ورديات متعددة"] },
      { name: "المؤسسات", nameEn: "Enterprise", priceMonthly: "80000", maxUsers: 50, maxProducts: 5000, maxBranches: 20, features: ["كل مزايا الاحترافية", "فروع متعددة", "دعم ذو أولوية", "سجل تدقيق موسّع"] },
    ]);
    console.log("✓ Plan catalog created (3 plans).");
  } else {
    console.log("• Plans already exist — skipped.");
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@meqwat.app").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  // users table is RLS-protected: identity writes run in platform context.
  const createdAdmin = await withTenantTx({ tenantId: null }, async (tx) => {
    const [existingAdmin] = await tx.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    if (existingAdmin) return false;
    if (!adminPassword || adminPassword.length < 10) {
      throw new Error("Set ADMIN_PASSWORD (10+ chars) in the environment before first bootstrap.");
    }
    await tx.insert(users).values({
      tenantId: null,
      name: process.env.ADMIN_NAME ?? "مدير المنصة",
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: "platform_admin",
    });
    return true;
  });
  console.log(createdAdmin ? `✓ Platform admin created: ${adminEmail}` : "• Platform admin already exists — skipped.");
  console.log("Bootstrap complete. No demo data was created.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Bootstrap failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
