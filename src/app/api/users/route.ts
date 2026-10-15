import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { getTenantPlan } from "@/lib/services";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TENANT_ROLES: Role[] = ["tenant_owner", "manager", "cashier"];

export const GET = handler(async () => {
  const user = await requireTenantUser("users:manage");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.tenantId, user.tenantId))
    .orderBy(users.createdAt);
  return ok({ items: rows });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("users:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = (body?.role ?? "cashier") as Role;
  if (!name || !email || password.length < 8) throw new ApiError("أدخل الاسم والبريد وكلمة مرور (٨ أحرف على الأقل)");
  if (!TENANT_ROLES.includes(role)) throw new ApiError("دور غير صالح");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ApiError("البريد الإلكتروني مستخدم مسبقاً");

  const plan = await getTenantPlan(user.tenantId);
  if (plan) {
    const [c] = await db.select({ c: count() }).from(users).where(and(eq(users.tenantId, user.tenantId), eq(users.isActive, true)));
    if ((c?.c ?? 0) >= plan.maxUsers) throw new ApiError(`وصلت إلى حد المستخدمين في باقتك (${plan.maxUsers})`);
  }

  const [created] = await db
    .insert(users)
    .values({ tenantId: user.tenantId, name, email, phone: body?.phone ?? null, passwordHash: await hashPassword(password), mustChangePassword: true, role })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive });
  await audit(user, "user.create", "user", created.id, { email, role });
  return ok(created, 201);
});
