import { handler,ok,requireTenantUser,requireMutationId } from "@/lib/api";
import { allocateHistoricalPayment } from "@/lib/services";
export const POST=handler(async(req:Request,{params}:{params:Promise<{id:string}>})=>{
 const user=await requireTenantUser('payments:manage'),{id}=await params,body=await req.json();
 requireMutationId(body);
 const result=await allocateHistoricalPayment({tenantId:user.tenantId,userId:user.id,role:user.role},id,body);
 return ok(result);
});
