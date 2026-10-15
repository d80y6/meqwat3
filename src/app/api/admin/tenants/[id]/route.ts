import { db } from "@/db";
import { tenants, subscriptions, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const { id } = await params;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) throw new ApiError("المتجر غير موجود", 404);
  const body = await req.json();

  if (body.status === "active" || body.status === "suspended") {
    const [updated] = await db
      .update(tenants)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await audit(user, `admin.tenant.${body.status}`, "tenant", id);
    return ok(updated);
  }

  if (body.planId || body.subscriptionStatus || body.endsAt || body.extendDays) {
    let planId = body.planId as string | undefined;
    if (planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
      if (!plan) throw new ApiError("الباقة غير موجودة");
    }
    const [latest] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!latest) throw new ApiError("لا يوجد اشتراك لهذا المتجر");
    const patch: Record<string, unknown> = {};
    if (planId) patch.planId = planId;
    if (body.subscriptionStatus && !["trial","active","past_due","cancelled","expired"].includes(body.subscriptionStatus)) throw new ApiError("حالة غير صالحة");
    if (body.subscriptionStatus) patch.status = body.subscriptionStatus;
    if (body.endsAt) patch.endsAt = new Date(body.endsAt);
    // Renewal shortcut: extendDays adds days from now.
    if (body.extendDays) {
      if (!Number.isInteger(Number(body.extendDays)) || Number(body.extendDays) < 1 || Number(body.extendDays) > 3660) throw new ApiError("مدة غير صالحة");
      const base = latest.endsAt && latest.endsAt > new Date() ? latest.endsAt : new Date();
      patch.endsAt = new Date(base.getTime() + Number(body.extendDays) * 86400_000);
      patch.status = "active";
    }
    const [updated] = await db.update(subscriptions).set(patch).where(eq(subscriptions.id, latest.id)).returning();
    await audit(user, "admin.subscription.update", "subscription", latest.id, { tenantId: id, ...patch, endsAt: undefined });
    return ok(updated);
  }

  throw new ApiError("لا يوجد إجراء صالح في الطلب");
});
