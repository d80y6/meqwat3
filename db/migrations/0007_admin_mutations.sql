-- Platform operations must replay without repeating extensions or plan creation.
CREATE TABLE admin_mutations (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id varchar(80) NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, mutation_id)
);
ALTER TABLE admin_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY admin_mutations_platform ON admin_mutations
  USING (current_setting('app.is_admin',true) = 'true')
  WITH CHECK (current_setting('app.is_admin',true) = 'true');
