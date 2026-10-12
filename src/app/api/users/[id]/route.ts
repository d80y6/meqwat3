import { users, sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { withTenantTx } from "@/lib/services";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TENANT_ROLES: Role[] = ["tenant_owner", "manager", "cashier"];

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("users:manage");
  const { id } = await params;
  const body = await req.json();

  const updated = await withTenantTx(user, async (tx) => {
    const [target] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, user.tenantId)))
      .limit(1);
    if (!target) throw new ApiError("المستخدم غير موجود", 404);

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
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
    }
    const [row] = await tx
      .update(users)
      .set(patch)
      .where(and(eq(users.id, id), eq(users.tenantId, user.tenantId)))
      .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive });
    return row;
  });
  await audit(user, "user.update", "user", id);
  return ok(updated);
});
