import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

// During `next build` without a DB (e.g. Docker build or local static generation),
// allow a dummy connection string so the module can be imported. Any real request
// that needs the DB will fail fast with a clear message if no URL is set.
const effectiveUrl = databaseUrl ?? "postgresql://build:build@127.0.0.1:5432/build_stub";

if (!databaseUrl && process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
  console.warn("[db] DATABASE_URL not set — using stub; all DB calls will fail until it is configured.");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: effectiveUrl,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
