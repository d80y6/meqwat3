-- Meqwat SaaS — PostgreSQL Row-Level Security policies.
--
-- Defense-in-depth tenant isolation. The application ALSO scopes every query
-- by tenant_id in the service layer, but with these policies a bug in any
-- query can never leak rows across tenants when the app connects with a
-- non-superuser role (e.g. `meqwat_app`).
--
-- Session variables (set per-transaction by src/lib/services.ts withTenantTx):
--   app.tenant_id  — current tenant UUID ('' when platform-level)
--   app.is_admin   — 'true' for platform administration contexts
--
-- Policy semantics: when app.tenant_id is SET (all transactional business
-- writes go through withTenantTx), rows of other tenants are invisible and
-- unwritable. When it is NOT set (pre-auth lookups, global admin reads done
-- by the trusted server process), access is allowed — the service layer's
-- explicit tenant_id filters remain the primary control there.
--
-- Apply after `npx drizzle-kit push`:
--   psql "$DATABASE_URL" -f db/rls.sql
-- Verified with a non-superuser role (meqwat_app): with tenant A set,
-- tenant B rows return 0 and cross-tenant INSERTs are rejected.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'subscriptions','users','products','customers','suppliers','cash_registers',
    'shifts','purchases','purchase_items','sales','sale_items','payments',
    'inventory_movements','financial_transactions','processed_mutations',
    'tenant_counters'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (
           coalesce(current_setting(''app.tenant_id'', true), '''') = ''''
           OR current_setting(''app.is_admin'', true) = ''true''
           OR tenant_id::text = current_setting(''app.tenant_id'', true)
         )
         WITH CHECK (
           coalesce(current_setting(''app.tenant_id'', true), '''') = ''''
           OR current_setting(''app.is_admin'', true) = ''true''
           OR tenant_id::text = current_setting(''app.tenant_id'', true)
         )', t);
  END LOOP;
END $$;

-- purchase_items / sale_items carry tenant_id too (denormalized for RLS).
-- audit_logs: readable only by owning tenant or platform admin.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_isolation ON audit_logs;
CREATE POLICY audit_isolation ON audit_logs
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    OR current_setting('app.is_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (true);

-- tenants: with a tenant context set, only the own row is visible.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    OR current_setting('app.is_admin', true) = 'true'
    OR id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.tenant_id', true), '') = ''
    OR current_setting('app.is_admin', true) = 'true'
  );

-- Reference/public tables stay readable (plans catalog is public).
ALTER TABLE plans DISABLE ROW LEVEL SECURITY;
