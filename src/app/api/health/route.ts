import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - started;
    return Response.json(
      {
        ok: true,
        latencyMs,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "database_unreachable",
        detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
