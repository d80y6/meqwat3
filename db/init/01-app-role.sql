-- Runs once at first container init (docker-entrypoint-initdb.d).
-- Creates the restricted application role used by the web app so that
-- PostgreSQL Row-Level Security policies (db/rls.sql) actually bind.
-- The schema owner (POSTGRES_USER) is used only for migrations/bootstrap.
\getenv app_pw APP_DB_PASSWORD
CREATE ROLE meqwat_app LOGIN PASSWORD :'app_pw';
GRANT CONNECT ON DATABASE meqwat TO meqwat_app;
GRANT USAGE ON SCHEMA public TO meqwat_app;
-- Tables created later by migrations (owned by POSTGRES_USER) get grants automatically:
ALTER DEFAULT PRIVILEGES FOR ROLE meqwat IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meqwat_app;
