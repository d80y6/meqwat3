import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * Row-Level Security must BIND when connected as the non-superuser
 * `meqwat_app` role (superusers bypass RLS by design).
 *
 * Setup: ADMIN_DB_URL=... ./scripts/verify-rls.sh   (creates role + policies)
 * Run:   RLS_TEST_DATABASE_URL=postgresql://meqwat_app:...@host/db npx vitest run tests/rls.test.ts
 * Skipped automatically when RLS_TEST_DATABASE_URL is not set.
 */
const url = process.env.RLS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("PostgreSQL RLS under restricted role meqwat_app", () => {
  const pool = new Pool({ connectionString: url });
  let tenantA = "";
  let tenantB = "";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    const rows = await admin.query("select id from tenants order by created_at limit 2");
    tenantA = rows.rows[0]?.id;
    tenantB = rows.rows[1]?.id;
    await admin.end();
    expect(tenantA).toBeTruthy();
    expect(tenantB).toBeTruthy();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("tenant context sees zero rows of another tenant", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      const own = await client.query("select count(*)::int c from products");
      const cross = await client.query("select count(*)::int c from products where tenant_id = $1", [tenantB]);
      await client.query("commit");
      expect(cross.rows[0].c).toBe(0);
      expect(own.rows[0].c).toBeGreaterThanOrEqual(0);
    } finally {
      client.release();
    }
  });

  it("no context sees zero tenant rows", async () => {
    const res = await pool.query("select count(*)::int c from products");
    expect(res.rows[0].c).toBe(0);
  });

  it("cross-tenant INSERT is rejected by policy WITH CHECK", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(
        client.query("insert into products (tenant_id, name) values ($1, 'rls-test-probe')", [tenantB]),
      ).rejects.toThrow(/row-level security/i);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("admin context sees all rows", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.is_admin', 'true', true)");
      const res = await client.query("select count(*)::int c from products");
      await client.query("commit");
      expect(res.rows[0].c).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });
});
