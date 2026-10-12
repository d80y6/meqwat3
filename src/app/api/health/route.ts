import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Liveness + readiness: verifies DB connectivity and reports latency. */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "meqwat-saas",
      db: { connected: true, latencyMs: Date.now() - started },
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { ok: false, service: "meqwat-saas", db: { connected: false }, timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}
