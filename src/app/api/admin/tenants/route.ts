import { db } from "@/db";
import { tenants, subscriptions, plans, users } from "@/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const rows = await db
    .select({
      tenant: tenants,
      planName: plans.name,
      subStatus: subscriptions.status,
      endsAt: subscriptions.endsAt,
      usersCount: sql<number>`(select count(*)::int from users u where u.tenant_id = ${tenants.id})`,
      salesCount: sql<number>`(select count(*)::int from sales s where s.tenant_id = ${tenants.id})`,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .orderBy(desc(tenants.createdAt));
  // Latest subscription per tenant only.
  const seen = new Set<string>();
  const items = rows.filter((r) => {
    if (seen.has(r.tenant.id)) return false;
    seen.add(r.tenant.id);
    return true;
  });
  return ok({ items });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const body = await req.json();
  const { provisionTenant } = await import("@/lib/provision");
  const result = await provisionTenant({
    businessName: String(body?.name ?? ""),
    ownerName: String(body?.ownerName ?? ""),
    email: String(body?.email ?? "").toLowerCase(),
    phone: String(body?.phone ?? ""),
    city: body?.city ? String(body.city) : undefined,
    planId: body?.planId ? String(body.planId) : undefined,
    isDemo: Boolean(body?.isDemo),
  });
  await audit(user, "admin.tenant.create", "tenant", result.tenant.id, { name: body?.name });
  const { sendOwnerCredentials } = await import("@/lib/mail");
  const mail = await sendOwnerCredentials({
    to: result.owner.email,
    ownerName: result.owner.name,
    tenantName: result.tenant.name,
    tempPassword: result.tempPassword,
    planName: result.plan.name,
  });
  return ok({ ...result, emailed: mail.sent, mailVia: mail.via }, 201);
});
