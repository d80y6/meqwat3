import { db } from "@/db";
import { payments,paymentAllocations } from "@/db/schema";
import { and,eq } from "drizzle-orm";
import { handler,ok,requireTenantUser,ApiError } from "@/lib/api";
export const GET=handler(async(_req:Request,{params}:{params:Promise<{id:string}>})=>{
 const user=await requireTenantUser('payments:manage'),{id}=await params;
 const [payment]=await db.select().from(payments).where(and(eq(payments.id,id),eq(payments.tenantId,user.tenantId)));
 if(!payment)throw new ApiError('السداد غير موجود',404);
 const allocations=await db.select().from(paymentAllocations).where(and(eq(paymentAllocations.paymentId,id),eq(paymentAllocations.tenantId,user.tenantId)));
 const [reversal]=await db.select({id:payments.id}).from(payments).where(and(eq(payments.reversesPaymentId,id),eq(payments.tenantId,user.tenantId)));
 return ok({payment,allocations,reversal:reversal??null});
});
