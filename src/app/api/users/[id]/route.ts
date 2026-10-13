import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TENANT_ROLES: Role[] = ["tenant_owner", "manager", "cashier"];

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("users:manage");
  const { id } = await params;
  if (id === user.id && req.method === "PATCH") {
    // Owners may still edit themselves below, but cannot deactivate self.
  }
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, user.tenantId)))
    .limit(1);
  if (!target) throw new ApiError("المستخدم غير موجود", 404);
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone) : null;
  if (body.role !== undefined) {
    if (!TENANT_ROLES.includes(body.role)) throw new ApiError("دور غير صالح");
    patch.role = body.role;
  }
  if (body.isActive !== undefined) {
    if (id === user.id && body.isActive === false) throw new ApiError("لا يمكنك تعطيل حسابك الحالي");
    patch.isActive = Boolean(body.isActive);
  }
  if (body.password) {
    if (String(body.password).length < 8) throw new ApiError("كلمة المرور قصيرة (٨ أحرف على الأقل)");
    patch.passwordHash = await hashPassword(String(body.password));
    // Force re-login everywhere after a password reset.
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
  }
  const [updated] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, id), eq(users.tenantId, user.tenantId)))
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive });
  await audit(user, "user.update", "user", id, { fields: Object.keys(patch) });
  return ok(updated);
});
