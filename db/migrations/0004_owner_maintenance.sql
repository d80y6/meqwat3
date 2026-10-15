-- Fix trigger return value for authorized schema-owner cleanup. App deletion remains denied.
CREATE OR REPLACE FUNCTION protect_posted_record() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
