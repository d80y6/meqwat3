-- Manual SaaS billing is separate from a shop's operational cash/stock ledger.
CREATE TABLE platform_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 description text NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency varchar(8) NOT NULL DEFAULT 'YER' CHECK(currency='YER'),
 due_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES platform_invoices(id),
 kind text NOT NULL CHECK(kind IN ('payment','refund')),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 reference text NOT NULL CHECK(length(reference)>0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_invoices_tenant ON platform_invoices(tenant_id,created_at);
CREATE INDEX platform_receipts_invoice ON platform_receipts(invoice_id);
ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_invoices_admin ON platform_invoices USING(current_setting('app.is_admin',true)='true') WITH CHECK(current_setting('app.is_admin',true)='true');
CREATE POLICY platform_receipts_admin ON platform_receipts USING(current_setting('app.is_admin',true)='true') WITH CHECK(current_setting('app.is_admin',true)='true');
CREATE TRIGGER platform_invoices_immutable BEFORE UPDATE OR DELETE ON platform_invoices FOR EACH ROW EXECUTE FUNCTION protect_posted_record();
CREATE TRIGGER platform_receipts_immutable BEFORE UPDATE OR DELETE ON platform_receipts FOR EACH ROW EXECUTE FUNCTION protect_posted_record();
