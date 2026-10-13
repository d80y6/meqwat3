import { db } from "@/db";
import { subscriptionRequests, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, fail, handler, requireTenantUser, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Public: a prospective shop submits a subscription request.
 * If the caller is an authenticated tenant user, the request is linked to
 * their tenant (plan-change/renewal request) — approval then upgrades the
 * existing subscription instead of provisioning a duplicate tenant.
 */
export async function POST(req: Request) {
  const { checkRateLimit, clientIp } = await import("@/lib/rate-limit");
  const limit = checkRateLimit(`subreq:${clientIp(req)}`, 5, 60 * 60_000);
  if (!limit.ok) return fail("طلبات كثيرة من عنوانك — حاول لاحقاً", 429, "RATE_LIMITED");
  const body = await req.json().catch(() => null);
  const businessName = String(body?.businessName ?? "").trim();
  const ownerName = String(body?.ownerName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
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
  // Tenant linkage is derived from the verified session ONLY — never from
  // client-supplied ids, so public signups cannot spoof another tenant.
  const { getCurrentUser } = await import("@/lib/auth");
  const sessionUser = await getCurrentUser().catch(() => null);
  const tenantId = sessionUser?.tenantId ?? null;
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
}

/** Tenant owners can view requests they own (matched by tenant) and plans. */
export const GET = handler(async () => {
  const user = await requireTenantUser();
  const activePlans = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceMonthly);
  const mine = await db
    .select()
    .from(subscriptionRequests)
    .where(eq(subscriptionRequests.tenantId, user.tenantId))
    .orderBy(desc(subscriptionRequests.createdAt))
    .limit(20);
  return ok({ plans: activePlans, requests: mine });
});
