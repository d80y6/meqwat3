import { db } from '@/db';
import { users,sessions,auditLogs } from '@/db/schema';
import { and,eq,sql,count } from 'drizzle-orm';
import { handler,ok,requireUser,requireRole,ApiError } from '@/lib/api';
import { adminMutation } from '@/lib/admin-mutation';
import { getTenantPlan } from '@/lib/services';
import { issuePasswordReset } from '@/lib/password-reset';
import { sendPasswordReset } from '@/lib/mail';
import { checkRateLimitAsync } from '@/lib/rate-limit';
export const POST=handler(async(req:Request,{params}:{params:Promise<{id:string}>})=>{
 const actor=await requireUser();requireRole(actor,'admin:tenants');const {id}=await params;const body=await req.json();
 if(body.action==='reset'){
  if(!(await checkRateLimitAsync(`admin-reset:${actor.id}:${body.userId}`,3,15*60000)).ok)throw new ApiError('محاولات كثيرة',429);
  const [target]=await db.select().from(users).where(and(eq(users.id,body.userId),eq(users.tenantId,id)));if(!target)throw new ApiError('المستخدم غير موجود',404);
  const result=await sendPasswordReset(target.email,await issuePasswordReset(target.id));
  await db.insert(auditLogs).values({tenantId:id,userId:actor.id,action:'admin.user.reset_delivery',entityType:'user',entityId:target.id,metadata:{sent:result.sent,via:result.via}});
  return ok({sent:result.sent,via:result.via});
 }
 return ok(await adminMutation(actor.id,'admin.user.manage',{...body,tenantId:id},async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id},0))`);
  const [target]=await tx.select().from(users).where(and(eq(users.id,body.userId),eq(users.tenantId,id))).for('update');if(!target)throw new ApiError('المستخدم غير موجود',404);
  if(!['revoke','disable','activate','role'].includes(body.action))throw new ApiError('إجراء غير صالح');
  if(body.action==='role'&&!['tenant_owner','manager','cashier'].includes(body.role))throw new ApiError('دور غير صالح');
  if(target.role==='tenant_owner'&&target.isActive&&(body.action==='disable'||(body.action==='role'&&body.role!=='tenant_owner'))){
    const [owners]=await tx.select({n:count()}).from(users).where(and(eq(users.tenantId,id),eq(users.role,'tenant_owner'),eq(users.isActive,true)));if(owners.n<=1)throw new ApiError('لا يمكن تعطيل أو تخفيض آخر مالك نشط',409);
  }
  if(body.action==='activate'&&!target.isActive){
    const plan=await getTenantPlan(id,tx);const [members]=await tx.select({n:count()}).from(users).where(and(eq(users.tenantId,id),eq(users.isActive,true)));
    if(plan&&members.n>=plan.maxUsers)throw new ApiError('حد المستخدمين في الباقة',409);
    await tx.update(users).set({isActive:true}).where(eq(users.id,target.id));
  }
  if(body.action==='disable')await tx.update(users).set({isActive:false}).where(eq(users.id,target.id));
  if(body.action==='role')await tx.update(users).set({role:body.role}).where(eq(users.id,target.id));
  await tx.update(sessions).set({revokedAt:new Date()}).where(eq(sessions.userId,target.id));
  await tx.insert(auditLogs).values({tenantId:id,userId:actor.id,action:`admin.user.${body.action}`,entityType:'user',entityId:target.id,metadata:{role:body.role??null}});
  return {updated:true};
 }));
});
