import { db } from "@/db";
import { customers, suppliers } from "@/db/schema";
import { and,eq,sql } from "drizzle-orm";
import { handler,ok,requireTenantUser,ApiError } from "@/lib/api";
import { settlementInvoices,isReconciled } from "@/lib/payment-allocation";
export const GET=handler(async(req:Request)=>{
 const user=await requireTenantUser("payments:manage");
 const query=new URL(req.url).searchParams, kind=query.get('kind'),partyId=query.get('partyId');
 if(!partyId||!['customer_payment','supplier_payment'].includes(kind??''))throw new ApiError('اختر الطرف ونوع السداد');
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.tenantId},0))`);
  const table=kind==='customer_payment'?customers:suppliers;
  const [party]=await tx.select({balance:table.balance}).from(table).where(and(eq(table.id,partyId),eq(table.tenantId,user.tenantId)));
  if(!party)throw new ApiError('الطرف غير موجود',404);
  const items=await settlementInvoices(tx,user.tenantId,kind as 'customer_payment'|'supplier_payment',partyId);
  return ok({items,balance:party.balance,reconciled:isReconciled(items,party.balance)});
 });
});
