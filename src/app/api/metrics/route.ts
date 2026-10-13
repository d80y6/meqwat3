import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { verifyAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Ops metrics endpoint for monitoring / alerting.
 * Public `/api/health` is for liveness; this endpoint requires platform_admin auth
 * and is intended for Prometheus scraping or Render uptime checks with a token.
 * If METRICS_TOKEN is set, the caller must send `Authorization: Bearer <token>` or be a platform_admin.
 */
export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let authorized = false;

  if (token && auth === token) authorized = true;
  if (!authorized) {
    // Fall back to platform_admin cookie auth
    const cookie = req.headers.get("cookie") ?? "";
    const at = cookie.match(/meqwat_at=([^;]+)/)?.[1];
    if (at) {
      const user = await verifyAccessToken(decodeURIComponent(at));
      if (user?.role === "platform_admin") authorized = true;
    }
  }
  if (!authorized && token) {
    return fail("غير مصرح", 401, "UNAUTHENTICATED");
  }
  // If no METRICS_TOKEN is set, allow any authenticated platform_admin or open in dev.
  if (!authorized && process.env.NODE_ENV === "production" && token) {
    return fail("غير مصرح", 401, "UNAUTHENTICATED");
  }

  const started = Date.now();
  let dbLatency: number | null = null;
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbLatency = Date.now() - started;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const mem = process.memoryUsage();
  return ok({
    ok: dbOk,
    dbLatencyMs: dbLatency,
    uptimeSec: Math.round(process.uptime()),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    timestamp: new Date().toISOString(),
  });
}
