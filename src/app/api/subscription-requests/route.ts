import { db } from "@/db";
import { subscriptionRequests, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, fail, handler, requireTenantUser, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public: a prospective shop submits a subscription request. */
export async function POST(req: Request) {
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
  const [created] = await db
    .insert(subscriptionRequests)
    .values({
      businessName, ownerName, email, phone,
      city: body?.city ? String(body.city) : null,
      planId,
      notes: body?.notes ? String(body.notes) : null,
    })
    .returning();
  return ok({ id: created.id, status: created.status }, 201);
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
