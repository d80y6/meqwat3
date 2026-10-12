import { db } from "@/db";
import { tenants, subscriptions, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("غير مسجل الدخول", 401, "UNAUTHENTICATED");
  let tenant: { id: string; name: string; currency: string; isDemo: boolean } | null = null;
  let subscription: { planName: string; status: string; endsAt: Date | null } | null = null;
  if (user.tenantId) {
    // Tenant-context transaction so the read also passes RLS policies when
    // the app connects as the restricted `meqwat_app` role.
    const { withTenantTx } = await import("@/lib/tx");
    const found = await withTenantTx({ tenantId: user.tenantId }, async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, user.tenantId!)).limit(1);
      const [s] = await tx
        .select({ status: subscriptions.status, endsAt: subscriptions.endsAt, planName: plans.name })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.tenantId, user.tenantId!))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      return { t: t ?? null, s: s ?? null };
    });
    if (found.t) tenant = { id: found.t.id, name: found.t.name, currency: found.t.currency, isDemo: found.t.isDemo };
    if (found.s) subscription = found.s;
  }
  return ok({ user, tenant, subscription, permissions: ROLE_PERMISSIONS[user.role] ?? [] });
}
