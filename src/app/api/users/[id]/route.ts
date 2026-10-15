import { getTenantPlan } from "@/lib/services";
import { db } from "@/db";
import { users, sessions, auditLogs } from "@/db/schema";
import { and, eq, sql, count } from "drizzle-orm";
import { ok, handler, requireTenantUser, ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TENANT_ROLES: Role[] = ["tenant_owner", "manager", "cashier"];

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("users:manage");
  const { id } = await params;
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
    if (id === user.id && body.role !== user.role) throw new ApiError("لا يمكنك تغيير دور حسابك الحالي");
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
    patch.mustChangePassword = true;
    // Force re-login everywhere after a password reset.

  }
  const updated = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.tenantId},0))`);
    const [current]=await tx.select().from(users).where(and(eq(users.id,id),eq(users.tenantId,user.tenantId))).for('update');
    if(!current)throw new ApiError('المستخدم غير موجود',404);
    if(body.isActive===true&&!current.isActive){
      const plan=await getTenantPlan(user.tenantId,tx);
      const [active]=await tx.select({n:count()}).from(users).where(and(eq(users.tenantId,user.tenantId),eq(users.isActive,true)));
      if(plan&&active.n>=plan.maxUsers)throw new ApiError('حد المستخدمين في الباقة',409);
    }
    if(current.role==='tenant_owner'&&current.isActive&&(body.isActive===false||(body.role&&body.role!=='tenant_owner'))){
      const [owners]=await tx.select({n:count()}).from(users).where(and(eq(users.tenantId,user.tenantId),eq(users.role,'tenant_owner'),eq(users.isActive,true)));
      if(owners.n<=1)throw new ApiError('لا يمكن تعطيل آخر مالك',409);
    }
    if (body.password || body.role !== undefined || body.isActive === false) {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, id));
    }
    const [row] = await tx
    .update(users)
    .set(patch)
    .where(and(eq(users.id, id), eq(users.tenantId, user.tenantId)))
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, isActive: users.isActive });
    await tx.insert(auditLogs).values({tenantId:user.tenantId,userId:user.id,action:"user.update",entityType:"user",entityId:id,metadata:{fields:Object.keys(patch)}});
    return row;
  });
  return ok(updated);
});
