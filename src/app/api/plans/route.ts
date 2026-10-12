import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public plan catalog for the landing page and subscription requests. */
export async function GET() {
  const rows = await db
    .select({ id: plans.id, name: plans.name, nameEn: plans.nameEn, priceMonthly: plans.priceMonthly, maxUsers: plans.maxUsers, maxProducts: plans.maxProducts, maxBranches: plans.maxBranches, features: plans.features })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(plans.priceMonthly);
  return ok({ items: rows });
}
