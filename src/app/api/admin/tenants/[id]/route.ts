import { db } from '@/db';
import { tenants,subscriptions,plans,users,products,auditLogs } from '@/db/schema';
import { eq,desc,sql,and,count } from 'drizzle-orm';
import { ok,handler,requireUser,requireRole,ApiError } from '@/lib/api';
import { adminMutation } from '@/lib/admin-mutation';
export const dynamic='force-dynamic';
export const GET=handler(async(_req:Request,{params}:{params:Promise<{id:string}>})=>{
  const actor=await requireUser();requireRole(actor,'admin:tenants');const {id}=await params;
  const [tenant]=await db.select().from(tenants).where(eq(tenants.id,id));if(!tenant)throw new ApiError('المتجر غير موجود',404);
  const history=await db.select({subscription:subscriptions,planName:plans.name}).from(subscriptions).innerJoin(plans,eq(plans.id,subscriptions.planId)).where(eq(subscriptions.tenantId,id)).orderBy(desc(subscriptions.createdAt),desc(subscriptions.id));
  const members=await db.select({id:users.id,name:users.name,email:users.email,role:users.role,isActive:users.isActive,mustChangePassword:users.mustChangePassword,lastLoginAt:users.lastLoginAt,
    activeSessions:sql<number>`(select count(*)::int from sessions s where s.user_id=${users.id} and s.revoked_at is null and s.expires_at>now())`
  }).from(users).where(eq(users.tenantId,id));
  const [usage]=await db.select({products:count()}).from(products).where(eq(products.tenantId,id));
  const events=await db.select().from(auditLogs).where(eq(auditLogs.tenantId,id)).orderBy(desc(auditLogs.createdAt)).limit(50);
  return ok({tenant,subscriptions:history,users:members,usage,events});
});
export const PATCH=handler(async(req:Request,{params}:{params:Promise<{id:string}>})=>{
  const actor=await requireUser();requireRole(actor,'admin:tenants');const {id}=await params;const body=await req.json();
  return ok(await adminMutation(actor.id,'admin.tenant.update',{...body,tenantId:id},async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id},0))`);
    const [tenant]=await tx.select().from(tenants).where(eq(tenants.id,id)).for('update');if(!tenant)throw new ApiError('المتجر غير موجود',404);
    if(body.status!==undefined){if(!['active','suspended'].includes(body.status))throw new ApiError('حالة غير صالحة');
      const [row]=await tx.update(tenants).set({status:body.status,updatedAt:new Date()}).where(eq(tenants.id,id)).returning();
      await tx.insert(auditLogs).values({tenantId:id,userId:actor.id,action:'admin.tenant.status',entityType:'tenant',entityId:id,metadata:{before:tenant.status,after:body.status}});return row;
    }
    const [latest]=await tx.select().from(subscriptions).where(eq(subscriptions.tenantId,id)).orderBy(desc(subscriptions.createdAt),desc(subscriptions.id)).for('update').limit(1);
    if(!latest)throw new ApiError('لا يوجد اشتراك');
    const patch:Partial<typeof subscriptions.$inferInsert>={};
    if(body.planId){const [plan]=await tx.select().from(plans).where(eq(plans.id,body.planId));if(!plan?.isActive)throw new ApiError('اختر باقة مفعّلة');
      const [members]=await tx.select({n:count()}).from(users).where(and(eq(users.tenantId,id),eq(users.isActive,true)));
      const [catalog]=await tx.select({n:count()}).from(products).where(eq(products.tenantId,id));
      if(members.n>plan.maxUsers||catalog.n>plan.maxProducts)throw new ApiError('الاستخدام الحالي يتجاوز حدود الباقة؛ عالج التجاوز أولاً',409);patch.planId=plan.id;
    }
    if(body.subscriptionStatus!==undefined){if(!['trial','active','past_due','cancelled','expired'].includes(body.subscriptionStatus))throw new ApiError('حالة اشتراك غير صالحة');patch.status=body.subscriptionStatus;}
    if(body.endsAt!==undefined){const date=new Date(body.endsAt);if(typeof body.endsAt!=='string'||Number.isNaN(date.getTime()))throw new ApiError('تاريخ غير صالح');patch.endsAt=date;}
    if(body.extendDays!==undefined && body.extendDays!==0){const days=Number(body.extendDays);if(!Number.isInteger(days)||days<1||days>3660)throw new ApiError('مدة غير صالحة');if(body.endsAt!==undefined)throw new ApiError('اختر تاريخاً أو تمديداً، لا كليهما');const base=latest.endsAt&&latest.endsAt>new Date()?latest.endsAt:new Date();patch.endsAt=new Date(base.getTime()+days*86400000);patch.status='active';}
    if(!Object.keys(patch).length)throw new ApiError('لا توجد تعديلات');
    const [row]=await tx.update(subscriptions).set(patch).where(eq(subscriptions.id,latest.id)).returning();
    await tx.insert(auditLogs).values({tenantId:id,userId:actor.id,action:'admin.subscription.update',entityType:'subscription',entityId:latest.id,metadata:{before:latest,after:row}});return row;
  }));
});
