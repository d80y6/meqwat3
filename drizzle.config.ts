import { defineConfig } from "drizzle-kit";

/**
 * Schema/migration config. Uses DATABASE_URL from the environment
 * (Render, CI, Docker) and falls back to the local development database.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
