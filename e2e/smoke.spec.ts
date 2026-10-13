import { test, expect } from "@playwright/test";

test.describe("Meqwat public surface", () => {
  test("landing page renders hero, features and plans section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /إدارة متاجر القات/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "تسجيل الدخول" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /باقات مرنة/ })).toBeVisible();
  });

  test("login page validates input and rejects bad credentials", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول إلى متجرك" })).toBeVisible();
    await page.getByLabel("البريد الإلكتروني").fill("nobody@example.com");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    // .first(): Next.js injects its own empty route-announcer alert element.
    await expect(page.getByRole("alert").first()).toContainText("بيانات الدخول غير صحيحة");
  });

  test("register page renders the subscription request form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "طلب اشتراك متجر جديد" })).toBeVisible();
    await expect(page.getByLabel(/اسم المتجر/)).toBeVisible();
    await expect(page.getByRole("button", { name: "إرسال الطلب" })).toBeVisible();
  });

  test("protected routes redirect anonymous users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("health endpoint is up", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
