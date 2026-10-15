/** Production startup fails closed; builds need neither credentials nor DB access. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL || (process.env.AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("Production requires DATABASE_URL and AUTH_SECRET (32+ characters)");
  }
  const { pool } = await import("./db");
  const result = await pool.query("select current_user as name, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
  const role=result.rows[0];
  if (role?.name !== "meqwat_app" || role.rolsuper || role.rolbypassrls) {
    throw new Error("Production must use the restricted meqwat_app role; use owner credentials only for migrations/bootstrap");
  }
}
