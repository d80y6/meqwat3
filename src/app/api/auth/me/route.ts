import { db } from "@/db";
import { tenants, subscriptions, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handler } from "@/lib/api";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  if (!user) return fail("غير مسجل الدخول", 401, "UNAUTHENTICATED");
  let tenant: { id: string; name: string; currency: string; isDemo: boolean } | null = null;
  let subscription: { planName: string; status: string; endsAt: Date | null } | null = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    if (t) tenant = { id: t.id, name: t.name, currency: t.currency, isDemo: t.isDemo };
    const [s] = await db
      .select({ status: subscriptions.status, endsAt: subscriptions.endsAt, planName: plans.name })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.tenantId, user.tenantId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (s) subscription = s;
  }
  return ok({ user, tenant, subscription, permissions: ROLE_PERMISSIONS[user.role] ?? [] });
});
