import { rotateRefreshSession } from "@/lib/auth";
import { handler, ok, fail } from "@/lib/api";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request) => {
  // Token-rotation is sensitive — prevent brute-force / replay exhaustion.
  const limit = await checkRateLimitAsync(`refresh:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return fail("محاولات كثيرة — حاول مجدداً بعد ثوانٍ", 429, "RATE_LIMITED");
  }
  const user = await rotateRefreshSession();
  if (!user) return fail("انتهت الجلسة", 401, "SESSION_EXPIRED");
  return ok({ user });
});
