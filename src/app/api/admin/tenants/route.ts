import { db } from "@/db";
import { tenants, subscriptions, plans, auditLogs } from "@/db/schema";
import { eq, desc, count, sql, or, ilike } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, parsePagination, escapeIlike } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user=await requireUser();requireRole(user,'admin:tenants');
  const {limit,offset,search}=parsePagination(req);
  const filter=search ? or(ilike(tenants.name,`%${escapeIlike(search)}%`),ilike(tenants.slug,`%${escapeIlike(search)}%`)) : undefined;
  const latest=db.selectDistinctOn([subscriptions.tenantId]).from(subscriptions).orderBy(subscriptions.tenantId,desc(subscriptions.createdAt),desc(subscriptions.id)).as('latest');
  const items=await db.select({tenant:tenants,planName:plans.name,subStatus:latest.status,endsAt:latest.endsAt,
    usersCount:sql<number>`(select count(*)::int from users u where u.tenant_id=${tenants.id})`,
    salesCount:sql<number>`(select count(*)::int from sales s where s.tenant_id=${tenants.id})`
  }).from(tenants).leftJoin(latest,eq(latest.tenantId,tenants.id)).leftJoin(plans,eq(latest.planId,plans.id))
    .where(filter).orderBy(desc(tenants.createdAt),tenants.id).limit(limit).offset(offset);
  const [total]=await db.select({n:count()}).from(tenants).where(filter);
  return ok({items,total:total.n});
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:tenants");
  const body = await req.json();
  const { provisionTenant } = await import("@/lib/provision");
  const result = await db.transaction(async tx => {
  const result = await provisionTenant({
    businessName: String(body?.name ?? ""),
    ownerName: String(body?.ownerName ?? ""),
    email: String(body?.email ?? "").toLowerCase(),
    phone: String(body?.phone ?? ""),
    city: body?.city ? String(body.city) : undefined,
    planId: body?.planId ? String(body.planId) : undefined,
    isDemo: Boolean(body?.isDemo),
  }, tx);
  await tx.insert(auditLogs).values({userId:user.id,tenantId:result.tenant.id,action:"admin.tenant.create",entityType:"tenant",entityId:result.tenant.id});
  return result;
  });
  const { sendOwnerCredentials } = await import("@/lib/mail");
  const mail = await sendOwnerCredentials({
    to: result.owner.email,
    ownerName: result.owner.name,
    tenantName: result.tenant.name,
    tempPassword: result.tempPassword,
    planName: result.plan.name,
  });
  await db.insert(auditLogs).values({tenantId:result.tenant.id,userId:user.id,action:'admin.owner.delivery',entityType:'user',entityId:result.owner.id,metadata:{sent:mail.sent,via:mail.via}});
  return ok({ ...result, emailed: mail.sent, mailVia: mail.via }, 201);
});
