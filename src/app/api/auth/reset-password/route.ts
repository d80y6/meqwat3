import { handler, ok, fail } from "@/lib/api";
import { consumePasswordReset } from "@/lib/password-reset";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
export const POST = handler(async (req: Request) => {
  if (!(await checkRateLimitAsync(`reset-consume:${clientIp(req)}`,10,15*60_000)).ok) return fail("محاولات كثيرة — حاول لاحقاً",429);
  const body=await req.json();
  await consumePasswordReset(String(body?.token??""),String(body?.password??""));
  return ok({reset:true});
});
