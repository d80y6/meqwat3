import { defineConfig } from "@playwright/test";

/**
 * Browser E2E against the production build.
 * Expects the app on http://127.0.0.1:3000 seeded with demo data
 * (`npx tsx src/db/seed.ts`). Starts the server if not already running.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    locale: "ar-YE",
    // Required in containerized sandboxes (no user namespaces, small /dev/shm).
    launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] },
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
