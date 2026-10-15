import { planInput } from "@/lib/admin-validation";
import { adminMutation } from "@/lib/admin-mutation";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const rows = await db.select().from(plans).orderBy(plans.priceMonthly);
  return ok({ items: rows });
});

export const POST = handler(async (req: Request) => {
  const user=await requireUser();requireRole(user,'admin:subscriptions');
  const body=await req.json();const input=planInput(body);
  const created=await adminMutation(user.id,'admin.plan.create',body,async tx=>{
    const [row]=await tx.insert(plans).values({...input,name:input.name!}).returning();return row;
  });
  return ok(created,201);
});
export const PATCH = handler(async (req: Request) => {
  const user=await requireUser();requireRole(user,'admin:subscriptions');
  const body=await req.json();const patch=planInput(body,true);
  return ok(await adminMutation(user.id,'admin.plan.update',body,async tx=>{
    const [plan]=await tx.select().from(plans).where(eq(plans.id,String(body.id))).for('update');
    if(!plan)throw new ApiError('الباقة غير موجودة',404);
    // Existing assignments retain their purchased limits: don't silently shrink a live plan.
    if((patch.maxUsers!==undefined && patch.maxUsers<plan.maxUsers)||(patch.maxProducts!==undefined&&patch.maxProducts<plan.maxProducts)||(patch.maxBranches!==undefined&&patch.maxBranches<plan.maxBranches)) {
      const [used]=await tx.select({id:subscriptions.id}).from(subscriptions).where(eq(subscriptions.planId,plan.id)).limit(1);
      if(used)throw new ApiError('أنشئ باقة جديدة لتخفيض حدود باقة مرتبطة باشتراكات',409);
    }
    const [row]=await tx.update(plans).set(patch).where(eq(plans.id,plan.id)).returning();return row;
  }));
});
