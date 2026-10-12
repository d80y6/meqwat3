import { tenants, subscriptions, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { withTenantTx } from "@/lib/services";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("غير مسجل الدخول", 401, "UNAUTHENTICATED");
  let tenant: { id: string; name: string; currency: string; isDemo: boolean } | null = null;
  let subscription: { planName: string; status: string; endsAt: Date | null } | null = null;
  if (user.tenantId) {
    const tenantId = user.tenantId;
    const data = await withTenantTx({ tenantId }, async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const [s] = await tx
        .select({ status: subscriptions.status, endsAt: subscriptions.endsAt, planName: plans.name })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.tenantId, tenantId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      return { t: t ?? null, s: s ?? null };
    });
    if (data.t) tenant = { id: data.t.id, name: data.t.name, currency: data.t.currency, isDemo: data.t.isDemo };
    if (data.s) subscription = data.s;
  }
  return ok({ user, tenant, subscription, permissions: ROLE_PERMISSIONS[user.role] ?? [] });
}
