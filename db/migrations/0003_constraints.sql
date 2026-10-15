-- Validating constraints intentionally FAIL on inconsistent historical rows.
-- Never auto-rewrite financial history; reconcile a backup copy first.
CREATE UNIQUE INDEX shifts_one_open_register_uq ON shifts(register_id) WHERE status = 'open';
DO $$
DECLARE parent text; rel text[];
BEGIN
  FOREACH parent IN ARRAY ARRAY['users','products','customers','suppliers','cash_registers','shifts','sales','purchases'] LOOP
    EXECUTE format('CREATE UNIQUE INDEX %I ON %I (tenant_id, id)', parent || '_tenant_id_id_uq', parent);
  END LOOP;
  FOREACH rel SLICE 1 IN ARRAY ARRAY[
    ['shifts','register_id','cash_registers'],['shifts','user_id','users'],
    ['purchases','supplier_id','suppliers'],['purchases','user_id','users'],['purchases','shift_id','shifts'],
    ['purchase_items','purchase_id','purchases'],['purchase_items','product_id','products'],
    ['sales','customer_id','customers'],['sales','user_id','users'],['sales','shift_id','shifts'],['sales','register_id','cash_registers'],
    ['sale_items','sale_id','sales'],['sale_items','product_id','products'],
    ['payments','customer_id','customers'],['payments','supplier_id','suppliers'],['payments','sale_id','sales'],
    ['payments','purchase_id','purchases'],['payments','shift_id','shifts'],['payments','user_id','users'],
    ['inventory_movements','product_id','products'],['inventory_movements','user_id','users'],
    ['financial_transactions','shift_id','shifts'],['financial_transactions','user_id','users']
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id,%I) REFERENCES %I(tenant_id,id)',
      rel[1], rel[1] || '_' || rel[2] || '_tenant_fk', rel[2], rel[3]);
  END LOOP;
END $$;
ALTER TABLE products ADD CONSTRAINT products_nonnegative CHECK (stock_qty >= 0 AND sale_price >= 0 AND cost_price >= 0 AND low_stock_threshold >= 0);
ALTER TABLE customers ADD CONSTRAINT customers_nonnegative CHECK (balance >= 0 AND credit_limit >= 0);
ALTER TABLE suppliers ADD CONSTRAINT suppliers_nonnegative CHECK (balance >= 0);
ALTER TABLE shifts ADD CONSTRAINT shifts_nonnegative CHECK (opening_cash >= 0 AND (counted_cash IS NULL OR counted_cash >= 0));
ALTER TABLE sales ADD CONSTRAINT sales_reconcile CHECK (total_amount >= 0 AND discount >= 0 AND discount <= total_amount AND paid_amount >= 0 AND credit_amount >= 0 AND paid_amount + credit_amount = total_amount - discount AND returned_amount BETWEEN 0 AND total_amount - discount);
ALTER TABLE purchases ADD CONSTRAINT purchases_reconcile CHECK (total_amount >= 0 AND paid_amount BETWEEN 0 AND total_amount);
ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_valid CHECK (qty >= 0 AND returned_qty BETWEEN 0 AND qty AND unit_cost >= 0 AND total >= 0);
ALTER TABLE sale_items ADD CONSTRAINT sale_items_valid CHECK (qty > 0 AND returned_qty BETWEEN 0 AND qty AND unit_price >= 0 AND total >= 0);
ALTER TABLE payments ADD CONSTRAINT payments_nonnegative CHECK (amount >= 0);

-- Immutable postings for the restricted application role. The schema owner can
-- perform reviewed maintenance; that power must never be used by the app.
CREATE FUNCTION protect_posted_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'meqwat_app' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Posted records cannot be deleted'; END IF;
    IF TG_TABLE_NAME IN ('sales','sale_items','purchase_items') THEN
      IF (to_jsonb(NEW) - ARRAY['returned_qty','returned_amount','status']) IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['returned_qty','returned_amount','status']) THEN
        RAISE EXCEPTION 'Posted document is immutable; use an authorized return';
      END IF;
    ELSE RAISE EXCEPTION 'Posted ledger is append only';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_items','purchases','purchase_items','payments','financial_transactions','inventory_movements','processed_mutations','audit_logs'] LOOP
    EXECUTE format('CREATE TRIGGER posted_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_posted_record()', t);
  END LOOP;
END $$;
