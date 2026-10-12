import { db } from "@/db";
import { users, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, verifyPassword, type AuthUser } from "@/lib/auth";
import { ok, fail, audit } from "@/lib/api";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email || !password) return fail("أدخل البريد الإلكتروني وكلمة المرور");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Constant-ish response for unknown users to avoid account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("بيانات الدخول غير صحيحة", 401, "BAD_CREDENTIALS");
  }
  if (!user.isActive) return fail("هذا الحساب موقوف، تواصل مع الإدارة", 403, "USER_DISABLED");

  let tenantName: string | null = null;
  if (user.tenantId) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    if (!tenant) return fail("المتجر المرتبط بالحساب غير موجود", 403);
    if (tenant.status !== "active") return fail("اشتراك المتجر موقوف حالياً، تواصل مع إدارة المنصة", 403, "TENANT_SUSPENDED");
    tenantName = tenant.name;
  }

  const authUser: AuthUser = {
    id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role as Role,
  };
  await createSession(authUser);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(authUser, "auth.login", "user", user.id);
  return ok({ user: { ...authUser, tenantName } });
}
