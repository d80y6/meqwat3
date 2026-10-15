import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authDb as db } from "@/db";
import { passwordResets, users, sessions, auditLogs } from "@/db/schema";
import { hashPassword } from "./auth";
import { ApiError } from "./api";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function issuePasswordReset(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.transaction(async tx => {
    await tx.select().from(users).where(eq(users.id,userId)).for("update");
    await tx.update(passwordResets).set({usedAt:new Date()}).where(eq(passwordResets.userId,userId));
    await tx.insert(passwordResets).values({userId,tokenHash:digest(token),expiresAt:new Date(Date.now()+30*60_000)});
  });
  return token;
}
export async function consumePasswordReset(token: string, password: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError("رابط الاستعادة غير صالح أو منتهي",400);
  const hash = await hashPassword(password);
  await db.transaction(async tx => {
    const [reset] = await tx.update(passwordResets).set({usedAt:new Date()})
      .where(and(eq(passwordResets.tokenHash,digest(token)),isNull(passwordResets.usedAt),gt(passwordResets.expiresAt,new Date())))
      .returning();
    if (!reset) throw new ApiError("رابط الاستعادة غير صالح أو منتهي",400);
    const [user] = await tx.update(users).set({passwordHash:hash,mustChangePassword:false}).where(eq(users.id,reset.userId)).returning();
    await tx.update(sessions).set({revokedAt:new Date()}).where(eq(sessions.userId,user.id));
    await tx.update(passwordResets).set({usedAt:new Date()}).where(eq(passwordResets.userId,user.id));
    await tx.insert(auditLogs).values({tenantId:user.tenantId,userId:user.id,action:"auth.password_reset",entityType:"user",entityId:user.id});
  });
}
