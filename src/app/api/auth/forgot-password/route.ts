import { authDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { handler, ok } from "@/lib/api";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { issuePasswordReset } from "@/lib/password-reset";
import { isMailConfigured, sendPasswordReset } from "@/lib/mail";
export const POST = handler(async (req: Request) => {
  const response = () => ok({ message:"إذا كان البريد مسجلاً، ستصلك تعليمات الاستعادة" });
  const limit = await checkRateLimitAsync(`reset:${clientIp(req)}`, 5, 15*60_000);
  if (!limit.ok) return response();
  const body = await req.json();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!isMailConfigured() || !process.env.APP_ORIGIN?.startsWith("https://")) return response();
  const [user] = await authDb.select().from(users).where(eq(users.email,email)).limit(1);
  if (user) await sendPasswordReset(email,await issuePasswordReset(user.id));
  return response();
});
