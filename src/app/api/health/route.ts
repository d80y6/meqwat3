import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Health/readiness probe used by Docker HEALTHCHECK, load balancers and
 * uptime monitors. Returns 200 only when the database answers; component
 * latencies are included for observability. Never expose publicly beyond
 * a load-balancer allowlist in production if you consider DB latency
 * sensitive — it reveals no business data.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
  let dbOk = false;
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    checks.database = { ok: true, latencyMs: Date.now() - t0 };
    dbOk = true;
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : "db error" };
  }
  const body = {
    ok: dbOk,
    service: "meqwat-saas",
    version: process.env.npm_package_version ?? "1.0.0",
    uptimeSec: Math.round(process.uptime()),
    checks,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
  return Response.json(body, { status: dbOk ? 200 : 503 });
}
