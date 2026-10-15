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
    for (const side of ["a","b"]) {
      const row=await admin.query("insert into tenants(name,slug,is_demo) values('rls-fixture',$1,true) returning id",[`audit-rls-${side}-${Date.now()}`]);
      const id=row.rows[0].id;
      if(side==="a") tenantA=id;else tenantB=id;
      await admin.query("insert into products(tenant_id,name) values($1,'rls-fixture')",[id]);
    }
    await admin.end();
    expect(tenantA).toBeTruthy();
    expect(tenantB).toBeTruthy();
  });

  afterAll(async () => {
    await pool.end();
    const admin = new Pool({connectionString:process.env.DATABASE_URL});
    for(const id of [tenantA,tenantB].filter(Boolean)) {
      await admin.query("delete from products where tenant_id=$1",[id]);
      await admin.query("delete from tenants where id=$1",[id]);
    }
    await admin.end();
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
      expect(own.rows[0].c).toBe(1);
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
  it("database composite foreign keys reject a cross-tenant product even with a valid tenant_id",async()=>{
    const admin=new Pool({connectionString:process.env.DATABASE_URL});
    const user=(await admin.query("insert into users(tenant_id,name,email,password_hash,role) values($1,'rls-test',$2,'x','tenant_owner') returning id",[tenantA,`rls-${Date.now()}@test.ye`])).rows[0].id;
    const sale=(await admin.query("insert into sales(tenant_id,user_id,invoice_no,total_amount) values($1,$2,1,0) returning id",[tenantA,user])).rows[0].id;
    const product=(await admin.query("select id from products where tenant_id=$1",[tenantB])).rows[0].id;
    const client=await pool.connect();
    try {
      await client.query('begin');await client.query("select set_config('app.tenant_id',$1,true)",[tenantA]);
      await expect(client.query("insert into sale_items(tenant_id,sale_id,product_id,qty,unit_price,total) values($1,$2,$3,1,0,0)",[tenantA,sale,product])).rejects.toMatchObject({code:'23503'});
      await client.query('rollback');
      await client.query('begin');await client.query("select set_config('app.tenant_id',$1,true)",[tenantA]);
      await expect(client.query("update sales set notes='silent modification' where id=$1",[sale])).rejects.toThrow(/immutable/);
      await client.query('rollback');
      await client.query('begin');await client.query("select set_config('app.tenant_id',$1,true)",[tenantA]);
      await expect(client.query("delete from sales where id=$1",[sale])).rejects.toThrow(/cannot be deleted/);
      await client.query('rollback');
    } finally {
      await client.query('rollback');client.release();
      await admin.query('delete from sales where id=$1',[sale]);await admin.query('delete from users where id=$1',[user]);await admin.end();
    }
  });

});
