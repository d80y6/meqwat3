CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;
CREATE POLICY reset_auth_only ON password_resets USING (current_setting('app.is_admin',true) = 'true') WITH CHECK (current_setting('app.is_admin',true) = 'true');
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_auth_only ON rate_limit_buckets USING (current_setting('app.is_admin',true) = 'true') WITH CHECK (current_setting('app.is_admin',true) = 'true');
