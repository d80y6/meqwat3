import { defineConfig } from "drizzle-kit";

/**
 * Migrations always run with a privileged (schema-owner) connection:
 * MIGRATION_DATABASE_URL in production, local superuser fallback for dev.
 * The application runtime uses the restricted `meqwat_app` role
 * (DATABASE_URL) so PostgreSQL RLS policies bind — see db/rls.sql.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
