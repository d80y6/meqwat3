import "dotenv/config";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Reviewed SQL only. No schema push or data-loss auto-acceptance at startup. */
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(72419001)");
    await client.query("create table if not exists meqwat_migrations (name text primary key, hash text not null, applied_at timestamptz not null default now())");
    const files = (await readdir("db/migrations")).filter(f => /^\d+.*\.sql$/.test(f)).sort();
    for (const name of files) {
      const sql = await readFile(`db/migrations/${name}`, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query("select hash from meqwat_migrations where name=$1", [name]);
      if (prior.rowCount) {
        if (prior.rows[0].hash !== hash) throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      const existing = name === "0000_initial.sql" && (await client.query("select to_regclass('public.tenants') as table_name")).rows[0].table_name;
      if (existing) {
        if (!process.argv.includes("--baseline-existing")) throw new Error("Existing unversioned schema: review backup/schema, then explicitly --baseline-existing");
        for (const match of sql.matchAll(/CREATE TABLE "([^"]+)"/g)) {
          if (!(await client.query("select to_regclass($1) as t", [`public.${match[1]}`])).rows[0].t) throw new Error(`Missing baseline table: ${match[1]}`);
        }
        console.log("Baselining existing schema after explicit operator approval; no initial DDL executed");
      } else await client.query(sql);
      await client.query("insert into meqwat_migrations(name,hash) values($1,$2)", [name,hash]);
      console.log(`Applied ${name}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    // pg errors can include sensitive SQL values. Only emit safe operational text.
    console.error("Migration failed and rolled back; inspect schema/constraints on a safe backup.");
    if (error instanceof Error && !('severity' in error)) console.error(error.message);
    process.exitCode = 1;
  } finally { client.release(); await pool.end(); }
}
void main();
