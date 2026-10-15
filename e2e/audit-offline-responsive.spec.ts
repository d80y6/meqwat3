import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import '../tests/test-database-safety';

test.describe('Responsive and offline durability',()=>{
  test.skip(!process.env.DATABASE_URL,'Disposable test database required');
  test('ambiguous sale response retains original ID; reload and sync never repost',async({page})=>{
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill('cashier@baraka.ye');
    await page.getByLabel('كلمة المرور').fill('Cashier@1234');
    await page.getByRole('button',{name:'تسجيل الدخول'}).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/pos');
    await page.locator('button:not([disabled])',{hasText:'همداني'}).first().click();
    let mutationId=''; let saleId='';
    await page.route('**/api/sales',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      mutationId=route.request().postDataJSON().clientMutationId;
      const response=await route.fetch(); expect(response.status()).toBe(201);
      saleId=(await response.json()).data.id;
      // The database committed, but the browser never receives the response.
      await route.abort('failed');
    });
    await page.getByRole('button',{name:/إتمام البيع/}).click();
    await expect(page.getByText('فاتورة معلّقة محلياً (بانتظار المزامنة)')).toBeVisible();
    expect(mutationId).toBeTruthy(); expect(saleId).toBeTruthy();
    await page.unroute('**/api/sales');
    await page.reload();
    const queued=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('meqwat_offline_v2:')).flatMap(k=>JSON.parse(localStorage.getItem(k)??'[]')));
    expect(queued.some((op:{clientMutationId:string})=>op.clientMutationId===mutationId)).toBe(true);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/sync'));
    await page.getByRole('button',{name:/مزامنة \(1\)/}).first().click();
    const body=await (await response).json();
    expect(body.data.results[0].status).toBe('duplicate');
    const db=new Pool({connectionString:process.env.DATABASE_URL});
    try { expect((await db.query('select id from sales where client_mutation_id=$1',[mutationId])).rows).toEqual([{id:saleId}]); }
    finally {await db.end();}
    await page.reload();
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('meqwat_offline_v2:')).flatMap(k=>JSON.parse(localStorage.getItem(k)??'[]')).length)).toBe(0);
  });

  test('lost expense response: manual retry after reload retains key and one ledger effect', async({page})=>{
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill('owner@baraka.ye');
    await page.getByLabel('كلمة المرور').fill('Owner@1234');
    await page.getByRole('button',{name:'تسجيل الدخول'}).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const description=`audit-expense-${Date.now()}`;
    const fill=async()=>{
      await page.goto('/cash');
      await page.getByRole('button',{name:'تسجيل مصروف',exact:true}).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByPlaceholder('نقل، إيجار، ضيافة…').fill(description);
      await dialog.locator('input[type="number"]').fill('0.30');
    };
    await fill();
    let key='';
    await page.route('**/api/expenses',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      key=route.request().postDataJSON().clientMutationId;
      const response=await route.fetch(); expect(response.status()).toBe(201);
      await route.abort('failed');
    });
    await page.getByRole('button',{name:'حفظ المصروف'}).click();
    await expect.poll(()=>key).not.toBe('');
    await expect(page.getByRole('button',{name:'حفظ المصروف'})).toBeEnabled();
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('meqwat_pending_v1:')).length)).toBe(1);
    await page.unroute('**/api/expenses');
    await fill();
    const replay=page.waitForResponse(r=>r.url().endsWith('/api/expenses')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'حفظ المصروف'}).click();
    const response=await replay;
    expect(response.request().postDataJSON().clientMutationId).toBe(key);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('meqwat_pending_v1:')).length)).toBe(0);
    const db=new Pool({connectionString:process.env.DATABASE_URL});
    try { const rows=(await db.query("select amount from financial_transactions where description like $1",[`%${description}%`])).rows;
      expect(rows).toEqual([{amount:'-0.30'}]);
    } finally {await db.end();}
  });

  for(const width of [1440,768,390]) test(`Arabic RTL at ${width}px: navigation, catalog and report`,async({page},info)=>{
    await page.setViewportSize({width,height:900});
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill('owner@baraka.ye');
    await page.getByLabel('كلمة المرور').fill('Owner@1234');
    await page.getByRole('button',{name:'تسجيل الدخول'}).click();
    await expect(page).toHaveURL(/\/dashboard/);
    for(const path of ['/dashboard','/pos','/products','/reports']) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('dir','rtl');
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} width`).toBe(true);
      await page.screenshot({path:info.outputPath(`${path.slice(1)}-${width}.png`),fullPage:true});
    }
    expect(errors).toEqual([]);
  });
});
