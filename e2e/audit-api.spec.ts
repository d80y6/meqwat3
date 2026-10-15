import { test, expect, request as requests, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import "../tests/test-database-safety";

test.describe("Independent audit: real HTTP and real PostgreSQL", () => {
  test.skip(!process.env.DATABASE_URL, "Requires isolated test DB, never production");
  const db = new Pool({connectionString:process.env.DATABASE_URL});
  const stamp=randomUUID();
  const tenants:string[]=[];
  let a: APIRequestContext, b: APIRequestContext, cashier: APIRequestContext, admin: APIRequestContext;
  let adminId:string;
  const requestIds:string[]=[];
  let ownerId:string, cashierId:string, productA:string, productB:string, customerA:string, supplierA:string;
  const password="Audit-test-only-1234";
  const login=async(email:string) => {
    const c=await requests.newContext({baseURL:process.env.E2E_BASE_URL??"http://127.0.0.1:3000"});
    expect((await c.post('/api/auth/login',{data:{email,password}})).status()).toBe(200);
    return c;
  };
  test.beforeAll(async()=>{
    const hash=await bcrypt.hash(password,12);
    for(const side of ['a','b']) {
      const t=(await db.query("insert into tenants(name,slug,is_demo) values($1,$2,true) returning id",['audit',`audit-${side}-${stamp}`])).rows[0].id;
      tenants.push(t);
      const u=(await db.query("insert into users(tenant_id,name,email,password_hash,role) values($1,'owner',$2,$3,'tenant_owner') returning id",[t,`${side}-${stamp}@test.ye`,hash])).rows[0].id;
      const p=(await db.query("insert into products(tenant_id,name,stock_qty,sale_price,cost_price) values($1,'audit-product',20,10,5) returning id",[t])).rows[0].id;
      if(side==='a'){ownerId=u;productA=p;}else productB=p;
    }
    adminId=(await db.query("insert into users(name,email,password_hash,role) values('audit-admin',$1,$2,'platform_admin') returning id",[`admin-${stamp}@test.ye`,hash])).rows[0].id;
    admin=await login(`admin-${stamp}@test.ye`);
    cashierId=(await db.query("insert into users(tenant_id,name,email,password_hash,role) values($1,'cashier',$2,$3,'cashier') returning id",[tenants[0],`cash-${stamp}@test.ye`,hash])).rows[0].id;
    customerA=(await db.query("insert into customers(tenant_id,name,credit_limit) values($1,'audit-customer',1000) returning id",[tenants[0]])).rows[0].id;
    supplierA=(await db.query("insert into suppliers(tenant_id,name) values($1,'audit-supplier') returning id",[tenants[0]])).rows[0].id;
    a=await login(`a-${stamp}@test.ye`);b=await login(`b-${stamp}@test.ye`);cashier=await login(`cash-${stamp}@test.ye`);
  });
  test.afterAll(async()=>{
    for(const c of [a,b,cashier,admin]) if(c) await c.dispose();
    // Delete only fixtures created by this suite, in dependency order.
    for(const id of requestIds) await db.query('delete from subscription_requests where id=$1',[id]);
    if(adminId) {await db.query('delete from audit_logs where user_id=$1',[adminId]);await db.query('delete from users where id=$1',[adminId]);}
    for(const t of tenants) {
      for(const table of ['sale_items','purchase_items','inventory_movements','financial_transactions','payments','sales','purchases','shifts','processed_mutations','tenant_counters','subscriptions','audit_logs','products','customers','suppliers','cash_registers','users']) {
        await db.query(`delete from ${table} where tenant_id=$1`,[t]);
      }
      await db.query('delete from tenants where id=$1',[t]);
    }
    await db.end();
  });

  test("all private collections reject anonymous callers and metrics is not public",async({request})=>{
    for(const path of ['sales','purchases','customers','suppliers','products','inventory','payments','shifts','registers','users','audit','dashboard','reports','metrics','admin/tenants']) {
      expect((await request.get(`/api/${path}`)).status(),path).toBe(401);
    }
  });
  test("cross-tenant reads, writes and foreign-key references denied",async()=>{
    const list=(await (await b.get('/api/products')).json()).data.items;
    expect(list.some((p:{id:string})=>p.id===productA)).toBe(false);
    expect((await b.patch(`/api/products/${productA}`,{data:{salePrice:'1'}})).status()).toBe(404);
    expect((await b.get(`/api/customers/${customerA}`)).status()).toBe(404);
    expect((await a.post('/api/sales',{data:{items:[{productId:productB,qty:'1'}],clientMutationId:randomUUID()}})).status()).toBe(404);
    expect((await b.post('/api/purchases',{data:{supplierId:supplierA,items:[{productId:productB,qty:'1'}],clientMutationId:randomUUID()}})).status()).toBe(404);
  });
  test("cashier cannot bypass RBAC through sync, or change queue owner",async()=>{
    const res=await cashier.post('/api/sync',{data:{tenantId:tenants[0],userId:cashierId,operations:['purchase','payment','stock'].map(type=>({type,payload:{},clientMutationId:randomUUID()}))}});
    expect(res.status()).toBe(200);
    expect((await res.json()).data.results.every((r:{status:string})=>r.status==='conflict')).toBe(true);
    expect((await cashier.post('/api/sync',{data:{tenantId:tenants[1],userId:ownerId,operations:[]}})).status()).toBe(403);
    for(const path of ['purchases','payments','suppliers','inventory','users','subscription-requests']) expect((await cashier.get(`/api/${path}`)).status(),path).toBe(403);
  });
  test("CSRF, malformed amounts, missing keys and duplicate payload conflicts",async()=>{
    expect((await a.post('/api/sales',{headers:{origin:'https://evil.example','sec-fetch-site':'same-site'},data:{}})).status()).toBe(403);
    expect((await a.post('/api/sales',{data:{items:[{productId:productA,qty:'1'}]}})).status()).toBe(400);
    expect((await a.post('/api/sales',{data:{clientMutationId:randomUUID(),items:[{productId:productA,qty:'1e3'}]}})).status()).toBe(400);
    const data={clientMutationId:randomUUID(),customerId:customerA,paidAmount:'5',items:[{productId:productA,qty:'1'}]};
    const responses=await Promise.all(Array.from({length:5},()=>a.post('/api/sales',{data})));
    expect(responses.filter(r=>r.status()===201)).toHaveLength(1);
    expect(responses.filter(r=>r.status()===200)).toHaveLength(4);
    expect((await a.post('/api/sales',{data:{...data,paidAmount:'4'}})).status()).toBe(409);
    expect((await db.query('select stock_qty from products where id=$1',[productA])).rows[0].stock_qty).toBe('19.000');
    expect((await db.query('select balance from customers where id=$1',[customerA])).rows[0].balance).toBe('5.00');
  });
  test("audit failure rolls back document, stock, payment and idempotency record",async()=>{
    const key=randomUUID();
    await db.query(`create or replace function audit_failure_probe() returns trigger language plpgsql as $$ BEGIN IF NEW.tenant_id::text = '${tenants[0]}' AND NEW.action = 'sale.create' THEN RAISE EXCEPTION 'audit probe'; END IF; RETURN NEW; END $$; CREATE TRIGGER audit_failure_probe BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_failure_probe()`);
    try {
      expect((await a.post('/api/sales',{data:{clientMutationId:key,items:[{productId:productA,qty:'1'}]}})).status()).toBe(500);
      expect((await db.query('select stock_qty from products where id=$1',[productA])).rows[0].stock_qty).toBe('19.000');
      expect((await db.query('select id from sales where client_mutation_id=$1',[key])).rowCount).toBe(0);
      expect((await db.query('select id from processed_mutations where client_mutation_id=$1',[key])).rowCount).toBe(0);
    } finally { await db.query('drop trigger audit_failure_probe on audit_logs; drop function audit_failure_probe()'); }
  });
  test("live role and disabled-user changes take effect before JWT expiry",async()=>{
    await db.query("update users set role='cashier' where id=$1",[ownerId]);
    expect((await a.get('/api/users')).status()).toBe(403);
    await db.query("update users set role='tenant_owner',is_active=false where id=$1",[ownerId]);
    expect((await a.get('/api/products')).status()).toBe(401);
    await db.query("update users set is_active=true where id=$1",[ownerId]);
  });

  test("subscription request approval provisions once, forces password change, and upgrades existing tenant",async({request})=>{
    const plan=(await db.query('select id from plans where is_active=true limit 1')).rows[0].id;
    const created=await request.post('/api/subscription-requests',{data:{businessName:`audit-${stamp}`,ownerName:'audit',email:`signup-${stamp}@test.ye`,phone:'770000000',planId:plan}});
    expect(created.status()).toBe(201);const id=(await created.json()).data.id;requestIds.push(id);
    const results=await Promise.all([admin.post('/api/admin/subscription-requests',{data:{requestId:id,action:'approve'}}),admin.post('/api/admin/subscription-requests',{data:{requestId:id,action:'approve'}})]);
    expect(results.filter(r=>r.status()===200)).toHaveLength(1);
    expect(results.filter(r=>r.status()===400)).toHaveLength(1);
    const approved=(await results.find(r=>r.status()===200)!.json()).data;
    tenants.push(approved.tenant.id);
    expect(approved.upgraded).toBe(false);
    const owner=await requests.newContext({baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000'});
    try {
      expect((await owner.post('/api/auth/login',{data:{email:approved.ownerEmail,password:approved.tempPassword}})).status()).toBe(200);
      expect((await owner.get('/api/products')).status()).toBe(403);
      expect((await owner.post('/api/auth/change-password',{data:{currentPassword:approved.tempPassword,password:'Changed-test-only-1234'}})).status()).toBe(200);
      expect((await owner.get('/api/products')).status()).toBe(401);
      expect((await owner.post('/api/auth/login',{data:{email:approved.ownerEmail,password:'Changed-test-only-1234'}})).status()).toBe(200);
      expect((await owner.get('/api/products')).status()).toBe(200);
      const renewal=await owner.post('/api/subscription-requests',{data:{businessName:'renewal',ownerName:'renewal',phone:'-',planId:plan}});
      expect(renewal.status()).toBe(201);const rid=(await renewal.json()).data.id;requestIds.push(rid);
      const upgrade=await admin.post('/api/admin/subscription-requests',{data:{requestId:rid,action:'approve'}});
      expect(upgrade.status()).toBe(200);const upgraded=(await upgrade.json()).data;
      expect(upgraded.upgraded).toBe(true);expect(upgraded.tenant.id).toBe(approved.tenant.id);expect(upgraded.tempPassword).toBeNull();
    } finally {await owner.dispose();}
  });

  test("purchase replay through sync matches REST defaults after lost response",async()=>{
    const key=randomUUID();const payload={supplierId:supplierA,paidAmount:'0',items:[{productId:productA,qty:'1',unitCost:'2'}],clientMutationId:key};
    const first=await a.post('/api/purchases',{data:payload});expect(first.status()).toBe(201);
    const synced=await a.post('/api/sync',{data:{tenantId:tenants[0],userId:ownerId,operations:[{type:'purchase',clientMutationId:key,payload}]}});
    const result=(await synced.json()).data.results[0];expect(result.status).toBe('duplicate');
    expect(result.result.id).toBe((await first.json()).data.id);
  });
  test("refresh token is consumed once and logout invalidates copied access cookie",async()=>{
    const storage=await a.storageState();
    const c1=await requests.newContext({baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000',storageState:storage});
    const c2=await requests.newContext({baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000',storageState:storage});
    const responses=await Promise.all([c1.post('/api/auth/refresh'),c2.post('/api/auth/refresh')]);
    expect(responses.map(r=>r.status()).sort()).toEqual([200,401]);
    expect((await a.get('/api/products')).status()).toBe(401);
    const winner=responses[0].status()===200?c1:c2;
    const copy=await requests.newContext({baseURL:process.env.E2E_BASE_URL??'http://127.0.0.1:3000',storageState:await winner.storageState()});
    expect((await winner.post('/api/auth/logout')).status()).toBe(200);
    expect((await copy.get('/api/products')).status()).toBe(401);
    await copy.dispose();await c1.dispose();await c2.dispose();
  });
  test("fractional monetary displays and drafts do not crash the browser", async({page})=>{
    const sale=await b.post('/api/sales',{data:{clientMutationId:randomUUID(),discount:'0.10',paidAmount:'0.20',items:[{productId:productB,qty:'1',unitPrice:'0.30'}]}});
    expect(sale.status()).toBe(201);
    for(const amount of ['0.10','0.20']) expect((await b.post('/api/expenses',{data:{clientMutationId:randomUUID(),amount,description:'fractional display'}})).status()).toBe(201);
    await page.context().addCookies((await b.storageState()).cookies);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    for(const path of ['/sales','/reports','/cash']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      if(path==='/sales') await expect(page.getByText('0.20 ر.ي',{exact:true}).first()).toBeVisible();
      if(path==='/cash') await expect(page.getByText(/إجمالي المصروفات المعروضة/)).toContainText('-0.30');
    }
    expect(errors).toEqual([]);
  });

});
