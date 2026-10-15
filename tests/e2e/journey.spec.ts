import { test, expect } from "@playwright/test";

/**
 * Critical user journeys through the real UI against real seeded data.
 * Demo accounts come from src/db/seed.ts (demo tenants only).
 */

test.describe("public journeys", () => {
  test("landing page loads with live plan catalog", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /إدارة متاجر القات/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "الاحترافية" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ابدأ الآن" })).toBeVisible();
  });

  test("subscription request can be submitted", async ({ page }) => {
    await page.goto("/register");
    const stamp = Date.now();
    await page.getByLabel(/اسم المتجر/).fill(`متجر اختبار E2E ${stamp}`);
    await page.getByLabel(/اسم المالك/).fill("مختبر آلي");
    await page.getByLabel(/رقم الهاتف/).fill("770000000");
    await page.getByLabel(/البريد الإلكتروني/).fill(`e2e-${stamp}@test.ye`);
    await page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(page.getByText("تم استلام طلبك بنجاح")).toBeVisible();
  });
});

test.describe("authenticated tenant journeys", () => {
  test("bad credentials are rejected, good ones reach the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("owner@baraka.ye");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible();

    await page.getByLabel("كلمة المرور").fill("Owner@1234");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
    await expect(page.getByText("مبيعات اليوم")).toBeVisible();
    await expect(page.getByText("ديون العملاء المستحقة")).toBeVisible();
  });

  test("POS: cashier sells an item and the invoice appears in sales", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("cashier@baraka.ye");
    await page.getByLabel("كلمة المرور").fill("Cashier@1234");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "نقطة البيع" })).toBeVisible();
    // Pick an in-stock product (همداني has ample seeded stock; out-of-stock
    // cards are disabled, so filter to enabled buttons only).
    const productButton = page.locator("button:not([disabled])", { hasText: "همداني" }).first();
    await productButton.click();
    await expect(page.getByText("سلة البيع")).toBeVisible();

    const posted = page.waitForResponse(r => r.url().endsWith("/api/sales") && r.request().method() === "POST");
    await page.getByRole("button", { name: /إتمام البيع/ }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    const invoice = (await response.json()).data;
    await expect(page.getByText(`تم حفظ الفاتورة #${invoice.invoiceNo}`, {exact:true})).toBeVisible();

    // The server-confirmed invoice must be listed in sales.
    await page.goto("/sales");
    await expect(page.getByRole("heading", { name: "المبيعات والفواتير" })).toBeVisible();
    await expect(page.locator("table tbody")).toContainText(String(invoice.invoiceNo));
    await page.reload();
    const persisted = await page.request.get("/api/sales");
    expect((await persisted.json()).data.items.some((sale: {id:string}) => sale.id === invoice.id)).toBe(true);
  });

  test("cashier cannot see owner-only navigation (users/subscription)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("cashier@baraka.ye");
    await page.getByLabel("كلمة المرور").fill("Cashier@1234");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "المستخدمون" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "الاشتراك والباقة" })).toHaveCount(0);
    // Direct navigation to a forbidden page yields an API-level 403-driven error state, not data.
    const res = await page.request.get("/api/users");
    expect(res.status()).toBe(403);
  });

  test("unauthenticated access to /pos redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("platform admin journeys", () => {
  test("admin sees tenants and pending subscription requests", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("البريد الإلكتروني").fill("admin@meqwat.app");
    await page.getByLabel("كلمة المرور").fill("Admin@1234");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("heading", { name: "إدارة المنصة" })).toBeVisible();
    await expect(page.getByText("متجر البركة للقات")).toBeVisible();
    await page.getByRole("tab", { name: /طلبات الاشتراك/ }).click();
    await expect(page.locator("table")).toBeVisible();
  });
});
