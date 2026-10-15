import { authDb as db } from "@/db";
import { subscriptionRequests, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, fail, handler, requireTenantUser, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Public: a prospective shop submits a subscription request.
 * If the caller is an authenticated tenant user, the request is linked to
 * their tenant (plan-change/renewal request) — approval then upgrades the
 * existing subscription instead of provisioning a duplicate tenant.
 */
export const POST = handler(async (req: Request) => {
  const { checkRateLimitAsync, clientIp } = await import("@/lib/rate-limit");
  const limit = await checkRateLimitAsync(`subreq:${clientIp(req)}`, 5, 60 * 60_000);
  if (!limit.ok) return fail("طلبات كثيرة من عنوانك — حاول لاحقاً", 429, "RATE_LIMITED");
  const body = await req.json().catch(() => null);
  const { getCurrentUser } = await import("@/lib/auth");
  const sessionUser = await getCurrentUser();
  if (sessionUser?.tenantId) requireRole(sessionUser, "subscription:manage");
  const tenantId = sessionUser?.tenantId ?? null;
  const businessName = String(body?.businessName ?? "").trim();
  const ownerName = String(sessionUser?.name ?? body?.ownerName ?? "").trim();
  const email = String(sessionUser?.email ?? body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  if (!businessName || !ownerName || !email || !phone) {
    return fail("أكمل بيانات المتجر والمالك والبريد والهاتف");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("صيغة البريد الإلكتروني غير صحيحة");
  let planId: string | null = null;
  if (body?.planId) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, String(body.planId))).limit(1);
    if (!plan) return fail("الباقة المختارة غير موجودة");
    planId = plan.id;
  }
  const [created] = await db
    .insert(subscriptionRequests)
    .values({
      businessName, ownerName, email, phone,
      city: body?.city ? String(body.city) : null,
      planId,
      tenantId,
      notes: body?.notes ? String(body.notes) : null,
    })
    .returning();
  return ok({ id: created.id, status: created.status, linked: Boolean(tenantId) }, 201);
});

/** Tenant owners can view requests they own (matched by tenant) and plans. */
export const GET = handler(async () => {
  const user = await requireTenantUser("subscription:manage");
  const activePlans = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceMonthly);
  const mine = await db
    .select()
    .from(subscriptionRequests)
    .where(eq(subscriptionRequests.tenantId, user.tenantId))
    .orderBy(desc(subscriptionRequests.createdAt))
    .limit(20);
  return ok({ plans: activePlans, requests: mine });
});
