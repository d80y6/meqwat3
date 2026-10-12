import { users } from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { getTenantPlan, withTenantTx } from "@/lib/services";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TENANT_ROLES: Role[] = ["tenant_owner", "manager", "cashier"];

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "23505" || e?.cause?.code === "23505" || /duplicate key/i.test(e?.message ?? "");
}

export const GET = handler(async () => {
  const user = await requireTenantUser("users:manage");
  const rows = await withTenantTx(user, async (tx) =>
    tx
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.tenantId, user.tenantId))
      .orderBy(users.createdAt),
  );
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

  // Cross-tenant email uniqueness is guaranteed by the DB unique index;
  // same-tenant duplicates are caught here with a friendly message.
  const passwordHash = await hashPassword(password);
  let created: { id: string; name: string; email: string; role: Role; isActive: boolean };
  try {
    created = await withTenantTx(user, async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw new ApiError("البريد الإلكتروني مستخدم مسبقاً");
      const plan = await getTenantPlan(user.tenantId);
      if (plan) {
        const [c] = await tx.select({ c: count() }).from(users).where(and(eq(users.tenantId, user.tenantId), eq(users.isActive, true)));
        if ((c?.c ?? 0) >= plan.maxUsers) throw new ApiError(`وصلت إلى حد المستخدمين في باقتك (${plan.maxUsers})`);
      }
      const [row] = await tx
        .insert(users)
        .values({ tenantId: user.tenantId, name, email, phone: body?.phone ?? null, passwordHash, role })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive });
      return row as typeof created;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError("البريد الإلكتروني مستخدم مسبقاً");
    throw err;
  }
  await audit(user, "user.create", "user", created.id, { email, role });
  return ok(created, 201);
});
