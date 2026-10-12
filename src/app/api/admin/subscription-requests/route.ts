import { db } from "@/db";
import { subscriptionRequests, plans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit, ApiError } from "@/lib/api";
import { approveRequest } from "@/lib/provision";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const conds = status ? eq(subscriptionRequests.status, status as "pending") : undefined;
  const rows = await db
    .select({ request: subscriptionRequests, planName: plans.name })
    .from(subscriptionRequests)
    .leftJoin(plans, eq(subscriptionRequests.planId, plans.id))
    .where(conds)
    .orderBy(desc(subscriptionRequests.createdAt))
    .limit(100);
  return ok({ items: rows.map((r) => ({ ...r.request, planName: r.planName })) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const body = await req.json();
  const requestId = String(body?.requestId ?? "");
  const action = String(body?.action ?? "");
  const [request] = await db.select().from(subscriptionRequests).where(eq(subscriptionRequests.id, requestId)).limit(1);
  if (!request) throw new ApiError("الطلب غير موجود", 404);
  if (request.status !== "pending") throw new ApiError("تمت مراجعة هذا الطلب مسبقاً");

  if (action === "reject") {
    const [updated] = await db
      .update(subscriptionRequests)
      .set({ status: "rejected", reviewedBy: user.id, reviewedAt: new Date(), notes: body?.notes ?? request.notes })
      .where(eq(subscriptionRequests.id, requestId))
      .returning();
    await audit(user, "admin.request.reject", "subscription_request", requestId);
    return ok(updated);
  }
  if (action === "approve") {
    const result = await approveRequest(requestId, user.id);
    await audit(user, "admin.request.approve", "subscription_request", requestId, { tenantId: result.tenant.id });
    // tempPassword is returned once so the admin can hand credentials to the owner.
    return ok(result);
  }
  throw new ApiError("إجراء غير صالح");
});
