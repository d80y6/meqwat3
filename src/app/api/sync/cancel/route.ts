import { handler,ok,requireTenantUser,requireRole,requireMutationId,ApiError } from '@/lib/api';
import { withTenantTx } from '@/lib/tx';
import { processedMutations,auditLogs } from '@/db/schema';
import { and,eq,sql } from 'drizzle-orm';
/** Atomically tombstone an unposted operation. Never cancels a posted document. */
export const POST=handler(async(req:Request)=>{
 const user=await requireTenantUser();const body=await req.json();const key=requireMutationId(body);
 if(body.tenantId!==user.tenantId||body.userId!==user.id)throw new ApiError('مالك الطابور غير مطابق',403);
 if(!['sale','purchase','payment','stock'].includes(body.type))throw new ApiError('نوع غير صالح');
 requireRole(user,body.type==='sale'?'pos:use':body.type==='purchase'?'purchases:manage':body.type==='payment'?'payments:manage':'inventory:manage');
 const reason=String(body.reason??'').trim();if(!reason||reason.length>500)throw new ApiError('سبب الإلغاء مطلوب (حتى ٥٠٠ حرف)');
 return ok(await withTenantTx(user,async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.tenantId},0))`);
  const [prior]=await tx.select().from(processedMutations).where(and(eq(processedMutations.tenantId,user.tenantId),eq(processedMutations.clientMutationId,key)));
  if(prior){if(prior.result.cancelled===true&&prior.result.actor===user.id)return {status:'cancelled'};return {status:'already_processed'};}
  await tx.insert(processedMutations).values({tenantId:user.tenantId,clientMutationId:key,entityType:'cancelled',result:{cancelled:true,actor:user.id,type:body.type,reason}});
  await tx.insert(auditLogs).values({tenantId:user.tenantId,userId:user.id,action:'sync.cancel_unposted',entityType:'sync',metadata:{mutationId:key,type:body.type,reason}});
  return {status:'cancelled'};
 }));
});
