import { randomBytes } from "crypto";
import { db } from "@/db";
import { tenants, subscriptions, plans, users, cashRegisters, subscriptionRequests } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import { ApiError } from "./api";
import { withTenantTx } from "./services";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "shop"}-${randomBytes(3).toString("hex")}`;
}

export interface ProvisionInput {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  city?: string;
  planId?: string;
  trialDays?: number;
  isDemo?: boolean;
}

/**
 * Provision a new tenant workspace: tenant row, trial subscription, owner
 * account (with a one-time generated password), and a default cash register.
 * Used by platform admins directly and when approving subscription requests.
 */
export async function provisionTenant(input: ProvisionInput) {
  if (!input.businessName.trim() || !input.ownerName.trim() || !input.email.trim()) {
    throw new ApiError("بيانات المتجر والمالك والبريد مطلوبة");
  }
  const existing = await withTenantTx({ tenantId: null }, async (tx) => {
    const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    return row ?? null;
  });
  if (existing) throw new ApiError("البريد الإلكتروني مستخدم لحساب آخر");

  let plan = null as typeof plans.$inferSelect | null;
  if (input.planId) {
    const [p] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
    if (!p) throw new ApiError("الباقة غير موجودة");
    plan = p;
  } else {
    const [p] = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceMonthly).limit(1);
    plan = p ?? null;
  }
  if (!plan) throw new ApiError("لا توجد باقات مفعّلة في المنصة");

  const tempPassword = `Meqwat@${randomBytes(4).toString("hex")}`;
  const passwordHash = await hashPassword(tempPassword);
  const trialDays = input.trialDays ?? 14;
  const endsAt = new Date(Date.now() + trialDays * 86400_000);

  const tenant = await db.transaction(async (tx) => {
    // Platform context: provisioning writes across tenant boundary (RLS).
    await tx.execute(sql`select set_config('app.is_admin', 'true', true)`);
    await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
    const [t] = await tx
      .insert(tenants)
      .values({
        name: input.businessName.trim(),
        slug: slugify(input.businessName),
        ownerName: input.ownerName.trim(),
        phone: input.phone,
        city: input.city ?? null,
        isDemo: Boolean(input.isDemo),
      })
      .returning();
    await tx.insert(subscriptions).values({
      tenantId: t.id, planId: plan!.id, status: "trial", endsAt,
    });
    const [owner] = await tx
      .insert(users)
      .values({
        tenantId: t.id, name: input.ownerName.trim(), email: input.email,
        phone: input.phone, passwordHash, role: "tenant_owner",
      })
      .returning();
    await tx.insert(cashRegisters).values({ tenantId: t.id, name: "الصندوق الرئيسي" });
    return { tenant: t, owner };
  });

  return {
    tenant: tenant.tenant,
    owner: { id: tenant.owner.id, email: tenant.owner.email, name: tenant.owner.name },
    tempPassword,
    plan: { id: plan.id, name: plan.name },
    trialEndsAt: endsAt,
  };
}

export interface ApproveResult {
  tenant: typeof tenants.$inferSelect;
  ownerEmail: string;
  /** One-time password for newly provisioned tenants; null for upgrades. */
  tempPassword: string | null;
  upgraded: boolean;
  planName: string;
}

/**
 * Approve a pending subscription request.
 * - New signup (no tenant link): provision a fresh workspace.
 * - Existing tenant (linked by verified session at submission time): apply
 *   the requested plan to the tenant's current subscription and reactivate
 *   it for 30 days — never provision a duplicate tenant.
 */
export async function approveRequest(requestId: string, reviewerId: string): Promise<ApproveResult> {
  const [request] = await db
    .select()
    .from(subscriptionRequests)
    .where(eq(subscriptionRequests.id, requestId))
    .limit(1);
  if (!request) throw new ApiError("الطلب غير موجود", 404);
  if (request.status !== "pending") throw new ApiError("تمت مراجعة هذا الطلب مسبقاً");

  if (request.tenantId) {
    const linkedTenantId = request.tenantId;
    const { tenant, latest } = await withTenantTx({ tenantId: null }, async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, linkedTenantId)).limit(1);
      if (!t) throw new ApiError("المتجر المرتبط بالطلب غير موجود", 404);
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, t.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (!sub) throw new ApiError("لا يوجد اشتراك حالي لهذا المتجر");
      return { tenant: t, latest: sub };
    });
    let planName = "";
    if (request.planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, request.planId)).limit(1);
      if (!plan) throw new ApiError("الباقة المطلوبة غير موجودة");
      planName = plan.name;
    }
    const base = latest.endsAt && latest.endsAt > new Date() ? latest.endsAt : new Date();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.is_admin', 'true', true)`);
      await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
      await tx
        .update(subscriptions)
        .set({
          ...(request.planId ? { planId: request.planId } : {}),
          status: "active",
          endsAt: new Date(base.getTime() + 30 * 86400_000),
        })
        .where(eq(subscriptions.id, latest.id));
      await tx
        .update(subscriptionRequests)
        .set({ status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() })
        .where(eq(subscriptionRequests.id, requestId));
    });
    if (!planName) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, latest.planId)).limit(1);
      planName = plan?.name ?? "";
    }
    return { tenant, ownerEmail: request.email, tempPassword: null, upgraded: true, planName };
  }

  const result = await provisionTenant({
    businessName: request.businessName,
    ownerName: request.ownerName,
    email: request.email,
    phone: request.phone,
    city: request.city ?? undefined,
    planId: request.planId ?? undefined,
  });
  await withTenantTx({ tenantId: null }, async (tx) => {
    await tx
      .update(subscriptionRequests)
      .set({ status: "approved", tenantId: result.tenant.id, reviewedBy: reviewerId, reviewedAt: new Date() })
      .where(eq(subscriptionRequests.id, requestId));
  });
  return {
    tenant: result.tenant,
    ownerEmail: result.owner.email,
    tempPassword: result.tempPassword,
    upgraded: false,
    planName: result.plan.name,
  };
}
