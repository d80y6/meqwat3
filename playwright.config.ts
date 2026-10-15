import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests. CI builds the app first, then this config starts
 * the production server itself. Locally: `npm run build` once, then
 * `npx playwright test`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "tests/e2e/**/*.spec.ts"],
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    locale: "ar-YE",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--use-gl=angle", "--use-angle=swiftshader"],
    } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        env: { DATABASE_URL: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL ?? "" },
        url: "http://127.0.0.1:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
