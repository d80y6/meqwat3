import { tenants, subscriptions, plans } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const rows = await withTenantTx({ tenantId: null }, async (tx) =>
    tx
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
      .orderBy(desc(tenants.createdAt)),
  );
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
  const { sendOwnerCredentials } = await import("@/lib/email");
  const mail = await sendOwnerCredentials({
    to: result.owner.email,
    ownerName: String(body?.ownerName ?? ""),
    tenantName: result.tenant.name,
    tempPassword: result.tempPassword,
  });
  return ok({ ...result, emailSent: mail.sent }, 201);
});
