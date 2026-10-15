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
-- Fail closed: absent context sees no tenant data. The server wraps every
-- statement in a transaction with explicit tenant or trusted auth/admin context.
-- Apply with schema owner, run the app as a non-superuser/non-BYPASSRLS role.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'subscriptions','users','products','customers','suppliers','cash_registers',
    'shifts','purchases','purchase_items','sales','sale_items','payments',
    'inventory_movements','financial_transactions','processed_mutations',
    'tenant_counters','subscription_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (
           current_setting(''app.is_admin'', true) = ''true''
           OR tenant_id::text = current_setting(''app.tenant_id'', true)
         )
         WITH CHECK (
           current_setting(''app.is_admin'', true) = ''true''
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
    current_setting('app.is_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (current_setting('app.is_admin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- tenants: with a tenant context set, only the own row is visible.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (
    current_setting('app.is_admin', true) = 'true'
    OR id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
  );

-- Reference/public tables stay readable (plans catalog is public).
ALTER TABLE plans DISABLE ROW LEVEL SECURITY;

-- Authentication is performed through the explicit trusted auth context.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_auth_only ON sessions;
CREATE POLICY session_auth_only ON sessions
  USING (current_setting('app.is_admin', true) = 'true' OR user_id IN (SELECT id FROM users WHERE tenant_id::text = current_setting('app.tenant_id', true)))
  WITH CHECK (current_setting('app.is_admin', true) = 'true' OR user_id IN (SELECT id FROM users WHERE tenant_id::text = current_setting('app.tenant_id', true)));
