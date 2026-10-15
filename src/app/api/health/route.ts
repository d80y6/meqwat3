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
  } catch {
    return Response.json(
      {
        ok: false,
        error: "database_unreachable",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
