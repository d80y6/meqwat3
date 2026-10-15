import { db } from '@/db';
import { auditLogs,tenants } from '@/db/schema';
import { eq,sql } from 'drizzle-orm';
import { handler,ok,requireUser,requireRole,ApiError,parsePagination } from '@/lib/api';
import { adminMutation } from '@/lib/admin-mutation';
import { toCents,fromCents } from '@/lib/money';
export const GET=handler(async(req:Request,{params}:{params:Promise<{id:string}>})=>{
 const actor=await requireUser();requireRole(actor,'admin:subscriptions');const {id}=await params;const {limit,offset}=parsePagination(req);
 const invoices=await db.execute(sql`select i.*,coalesce((select sum(case when r.kind='payment' then r.amount else -r.amount end) from platform_receipts r where r.invoice_id=i.id),0)::text as received from platform_invoices i where i.tenant_id=${id} order by i.created_at desc,i.id limit ${limit} offset ${offset}`);
 const total=await db.execute(sql`select count(*)::int n from platform_invoices where tenant_id=${id}`);
 const receipts=await db.execute(sql`select r.* from platform_receipts r join platform_invoices i on i.id=r.invoice_id where i.tenant_id=${id} order by r.created_at desc limit 200`);
 return ok({items:invoices.rows,total:total.rows[0].n,receipts:receipts.rows});
});
export const POST=handler(async(req:Request,{params}:{params:Promise<{id:string}>})=>{
 const actor=await requireUser();requireRole(actor,'admin:subscriptions');const {id}=await params;const body=await req.json();
 const cents=toCents(body.amount);if(cents<=0)throw new ApiError('المبلغ يجب أن يكون موجباً');
 return ok(await adminMutation(actor.id,'admin.billing.post',{...body,tenantId:id},async tx=>{
  const [tenant]=await tx.select({id:tenants.id}).from(tenants).where(eq(tenants.id,id));if(!tenant)throw new ApiError('المتجر غير موجود',404);
  let record:Record<string,unknown>;
  if(body.action==='invoice'){
    const description=String(body.description??'').trim(),due=new Date(body.dueAt);
    if(typeof body.dueAt!=='string'||!description||description.length>500||Number.isNaN(due.getTime()))throw new ApiError('وصف وتاريخ استحقاق صالح مطلوبان');
    const result=await tx.execute(sql`insert into platform_invoices(tenant_id,description,amount,due_at,created_by) values(${id},${description},${fromCents(cents)},${due.toISOString()},${actor.id}) returning *`);record=result.rows[0];
  }else{
    if(!['payment','refund'].includes(body.action))throw new ApiError('إجراء غير صالح');
    const reference=String(body.reference??'').trim();if(!reference||reference.length>200)throw new ApiError('مرجع التحصيل أو سبب الاسترداد مطلوب');
    const invoice=await tx.execute(sql`select * from platform_invoices where id=${String(body.invoiceId)} and tenant_id=${id} for update`);
    if(!invoice.rows[0])throw new ApiError('الفاتورة غير موجودة',404);
    const paid=await tx.execute(sql`select coalesce(sum(case when kind='payment' then amount else -amount end),0)::text n from platform_receipts where invoice_id=${String(body.invoiceId)}`);
    const received=toCents(paid.rows[0].n as string),amount=toCents(invoice.rows[0].amount as string);
    if(body.action==='payment'&&cents>amount-received)throw new ApiError('التحصيل يتجاوز المتبقي',409);
    if(body.action==='refund'&&cents>received)throw new ApiError('الاسترداد يتجاوز المحصل',409);
    const result=await tx.execute(sql`insert into platform_receipts(invoice_id,kind,amount,reference,created_by) values(${String(body.invoiceId)},${body.action},${fromCents(cents)},${reference},${actor.id}) returning *`);record=result.rows[0];
  }
  await tx.insert(auditLogs).values({tenantId:id,userId:actor.id,action:`admin.billing.${body.action}`,entityType:'platform_billing',entityId:record.id as string,metadata:{amount:fromCents(cents),invoiceId:body.invoiceId??null}});
  return record;
 }),201);
});
