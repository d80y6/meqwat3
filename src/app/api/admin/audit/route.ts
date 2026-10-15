import { db } from '@/db';
import { auditLogs,users } from '@/db/schema';
import { and,eq,desc,count,ilike } from 'drizzle-orm';
import { handler,ok,requireUser,requireRole,parsePagination,escapeIlike } from '@/lib/api';
export const GET=handler(async(req:Request)=>{
 const actor=await requireUser();requireRole(actor,'admin:tenants');
 const {limit,offset,search}=parsePagination(req);const tenantId=new URL(req.url).searchParams.get('tenantId');
 const where=and(tenantId?eq(auditLogs.tenantId,tenantId):undefined,search?ilike(auditLogs.action,`%${escapeIlike(search)}%`):undefined);
 const items=await db.select({log:auditLogs,userName:users.name}).from(auditLogs).leftJoin(users,eq(users.id,auditLogs.userId)).where(where).orderBy(desc(auditLogs.createdAt),auditLogs.id).limit(limit).offset(offset);
 const [total]=await db.select({n:count()}).from(auditLogs).where(where);return ok({items:items.map(x=>({...x.log,userName:x.userName})),total:total.n});
});
