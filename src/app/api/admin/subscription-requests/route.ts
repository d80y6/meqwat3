import { db } from "@/db";
import { subscriptionRequests, plans } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
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
      .where(and(eq(subscriptionRequests.id, requestId), eq(subscriptionRequests.status, "pending")))
      .returning();
    if (!updated) throw new ApiError("تمت مراجعة هذا الطلب مسبقاً", 409);
    await audit(user, "admin.request.reject", "subscription_request", requestId);
    return ok(updated);
  }
  if (action === "approve") {
    const result = await approveRequest(requestId, user.id);
    await audit(user, "admin.request.approve", "subscription_request", requestId, { tenantId: result.tenant.id });
    // Deliver one-time credentials by email when SMTP is configured;
    // otherwise they are returned once for manual hand-over by the admin.
    let emailed = false;
    let mailVia: string | undefined;
    if (result.tempPassword) {
      const { sendOwnerCredentials } = await import("@/lib/mail");
      const r = await sendOwnerCredentials({
        to: result.ownerEmail,
        ownerName: result.ownerName ?? request.ownerName,
        tenantName: result.tenant.name,
        tempPassword: result.tempPassword,
        planName: result.planName,
      });
      emailed = r.sent;
      mailVia = r.via;
      if (!r.sent) {
        // Also try to notify existing tenant upgrades even without temp password
        const { sendPlanChangeApproved } = await import("@/lib/mail");
        if (result.upgraded) {
          await sendPlanChangeApproved({
            to: result.ownerEmail,
            tenantName: result.tenant.name,
            planName: result.planName,
            endsAt: result.trialEndsAt ?? new Date(Date.now() + 30 * 86400_000),
          });
        }
      }
    } else if (result.upgraded) {
      const { sendPlanChangeApproved } = await import("@/lib/mail");
      const r = await sendPlanChangeApproved({
        to: result.ownerEmail,
        tenantName: result.tenant.name,
        planName: result.planName,
        endsAt: result.trialEndsAt ?? new Date(Date.now() + 30 * 86400_000),
      });
      emailed = r.sent;
      mailVia = r.via;
    }
    return ok({ ...result, emailed, mailVia });
  }
  throw new ApiError("إجراء غير صالح");
});
