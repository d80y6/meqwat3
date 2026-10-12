import { rotateRefreshSession } from "@/lib/auth";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await rotateRefreshSession();
  if (!user) return fail("انتهت الجلسة", 401, "SESSION_EXPIRED");
  return ok({ user });
}
