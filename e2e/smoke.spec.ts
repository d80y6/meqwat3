import { test, expect } from "@playwright/test";

/**
 * Browser-level smoke journeys against the production build.
 * Requires the demo seed (owner@baraka.ye) and a running server
 * (playwright.config.ts starts one automatically).
 */

test("landing page renders hero and live plan catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("إدارة متاجر القات باحترافية")).toBeVisible();
  // Plans come from the real /api/plans endpoint.
  await expect(page.getByText("الاحترافية")).toBeVisible({ timeout: 10_000 });
});

test("login rejects wrong credentials with an Arabic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("owner@baraka.ye");
  await page.getByLabel("كلمة المرور").fill("wrong-password");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("بيانات الدخول غير صحيحة")).toBeVisible({ timeout: 10_000 });
});

test("owner login reaches dashboard and POS with real products", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("owner@baraka.ye");
  await page.getByLabel("كلمة المرور").fill("Owner@1234");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("مبيعات اليوم")).toBeVisible();

  await page.getByRole("link", { name: "نقطة البيع" }).click();
  await expect(page.getByRole("heading", { name: "نقطة البيع" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("قات همداني فاخر")).toBeVisible({ timeout: 10_000 });
});

test("register page validates required fields", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("أكمل اسم المتجر واسم المالك والهاتف")).toBeVisible({ timeout: 10_000 });
});

test("protected route redirects anonymous users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
