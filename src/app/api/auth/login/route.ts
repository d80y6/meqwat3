import { users, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, verifyPassword, type AuthUser } from "@/lib/auth";
import { ok, fail, audit } from "@/lib/api";
import { withTenantTx } from "@/lib/services";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!email || !password) return fail("أدخل البريد الإلكتروني وكلمة المرور");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limitKey = `login:${ip}:${email}`;
  const limit = rateLimit(limitKey, MAX_ATTEMPTS, WINDOW_MS);
  if (!limit.allowed) {
    return fail(`محاولات دخول كثيرة — أعد المحاولة بعد ${Math.ceil(limit.retryAfterSec / 60)} دقيقة`, 429, "RATE_LIMITED");
  }

  // Identity tables are RLS-protected: pre-auth lookups run in platform context.
  const found = await withTenantTx({ tenantId: null }, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return { user: null, tenantName: null, tenantBlocked: false };
    let tenantName: string | null = null;
    let tenantBlocked = false;
    if (user.tenantId) {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
      if (!tenant || tenant.status !== "active") tenantBlocked = true;
      else tenantName = tenant.name;
    }
    return { user, tenantName, tenantBlocked };
  });
  const { user, tenantName, tenantBlocked } = found;

  // Constant-ish response for unknown users to avoid account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return fail("بيانات الدخول غير صحيحة", 401, "BAD_CREDENTIALS");
  }
  if (!user.isActive) return fail("هذا الحساب موقوف، تواصل مع الإدارة", 403, "USER_DISABLED");
  if (tenantBlocked) return fail("اشتراك المتجر موقوف حالياً، تواصل مع إدارة المنصة", 403, "TENANT_SUSPENDED");
  rateLimitReset(limitKey);

  const authUser: AuthUser = {
    id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role as Role,
  };
  await createSession(authUser);
  await withTenantTx({ tenantId: null }, async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  });
  await audit(authUser, "auth.login", "user", user.id);
  return ok({ user: { ...authUser, tenantName } });
}
