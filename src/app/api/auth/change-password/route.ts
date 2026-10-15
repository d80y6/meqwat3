import { authDb as db } from "@/db";
import { users, sessions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handler, requireUser, ok, ApiError } from "@/lib/api";
import { hashPassword, verifyPassword, destroySession } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
export const POST=handler(async(req:Request)=>{
  const user=await requireUser();
  if(!(await checkRateLimitAsync(`password-change:${clientIp(req)}:${user.id}`,5,15*60_000)).ok) throw new ApiError("محاولات كثيرة — حاول لاحقاً",429);
  const body=await req.json();
  const password=String(body?.password??""); const current=String(body?.currentPassword??"");
  if(Buffer.byteLength(current,'utf8')>72 || current===password) throw new ApiError("اختر كلمة مرور جديدة مختلفة");
  const hash=await hashPassword(password);
  await db.transaction(async tx=>{
    const [row]=await tx.select().from(users).where(eq(users.id,user.id)).for('update');
    if(!row || !(await verifyPassword(current,row.passwordHash))) throw new ApiError("كلمة المرور الحالية غير صحيحة",400);
    await tx.update(users).set({passwordHash:hash,mustChangePassword:false}).where(eq(users.id,user.id));
    await tx.update(sessions).set({revokedAt:new Date()}).where(eq(sessions.userId,user.id));
    await tx.insert(auditLogs).values({tenantId:user.tenantId,userId:user.id,action:'auth.password_change',entityType:'user',entityId:user.id});
  });
  await destroySession();
  return ok({changed:true});
});
