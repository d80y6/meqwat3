-- Existing credentials are not expired blindly; new provisioned users require change.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
CREATE INDEX rate_limit_expiry_idx ON rate_limit_buckets(resets_at);
