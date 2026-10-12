import { tenants, subscriptions, plans } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit, ApiError } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const { id } = await params;
  const body = await req.json();

  const adminCtx = { tenantId: null };
  const [tenant] = await withTenantTx(adminCtx, async (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, id)).limit(1),
  );
  if (!tenant) throw new ApiError("المتجر غير موجود", 404);

  if (body.status === "active" || body.status === "suspended") {
    const updated = await withTenantTx(adminCtx, async (tx) => {
      const [row] = await tx
        .update(tenants)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();
      return row;
    });
    await audit(user, `admin.tenant.${body.status}`, "tenant", id);
    return ok(updated);
  }

  if (body.planId || body.subscriptionStatus || body.endsAt || body.extendDays) {
    const updated = await withTenantTx(adminCtx, async (tx) => {
      let planId = body.planId as string | undefined;
      if (planId) {
        const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
        if (!plan) throw new ApiError("الباقة غير موجودة");
      }
      const [latest] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (!latest) throw new ApiError("لا يوجد اشتراك لهذا المتجر");
      const patch: Record<string, unknown> = {};
      if (planId) patch.planId = planId;
      if (body.subscriptionStatus) patch.status = body.subscriptionStatus;
      if (body.endsAt) patch.endsAt = new Date(body.endsAt);
      // Renewal shortcut: extendDays adds days from now (or from current end).
      if (body.extendDays) {
        const base = latest.endsAt && latest.endsAt > new Date() ? latest.endsAt : new Date();
        patch.endsAt = new Date(base.getTime() + Number(body.extendDays) * 86400_000);
        patch.status = "active";
      }
      const [row] = await tx.update(subscriptions).set(patch).where(eq(subscriptions.id, latest.id)).returning();
      return row;
    });
    await audit(user, "admin.subscription.update", "subscription", updated.id, { tenantId: id });
    return ok(updated);
  }

  throw new ApiError("لا يوجد إجراء صالح في الطلب");
});
