-- No historical payment is assigned to an invoice by this migration.
CREATE UNIQUE INDEX payments_tenant_id_id_uq ON payments(tenant_id,id);
ALTER TABLE payments ADD COLUMN reverses_payment_id uuid;
ALTER TABLE payments ADD CONSTRAINT payments_reversal_tenant_fk FOREIGN KEY(tenant_id,reverses_payment_id) REFERENCES payments(tenant_id,id);
CREATE UNIQUE INDEX payment_one_reversal ON payments(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;
CREATE TABLE payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 payment_id uuid NOT NULL,
 sale_id uuid,
 purchase_id uuid,
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((sale_id IS NOT NULL)::int + (purchase_id IS NOT NULL)::int = 1),
 FOREIGN KEY(tenant_id,payment_id) REFERENCES payments(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,sale_id) REFERENCES sales(tenant_id,id),
 FOREIGN KEY(tenant_id,purchase_id) REFERENCES purchases(tenant_id,id)
);
CREATE UNIQUE INDEX allocation_sale_unique ON payment_allocations(payment_id,sale_id);
CREATE UNIQUE INDEX allocation_purchase_unique ON payment_allocations(payment_id,purchase_id);
CREATE INDEX allocation_sale_lookup ON payment_allocations(tenant_id,sale_id);
CREATE INDEX allocation_purchase_lookup ON payment_allocations(tenant_id,purchase_id);
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY allocation_tenant ON payment_allocations
 USING(current_setting('app.is_admin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(current_setting('app.is_admin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE TRIGGER allocation_immutable BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION protect_posted_record();
