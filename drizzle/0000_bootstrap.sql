-- pushguard is the role the app connects as. NOINHERIT: it holds no rights of
-- its own and must switch to one of the two roles below before any statement runs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pushguard_app') THEN
    CREATE ROLE pushguard_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pushguard_system') THEN
    CREATE ROLE pushguard_system NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pushguard') THEN
    CREATE ROLE pushguard LOGIN NOINHERIT;
  END IF;
END $$;
--> statement-breakpoint
GRANT pushguard_app TO pushguard;
--> statement-breakpoint
GRANT pushguard_system TO pushguard;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS authz;
--> statement-breakpoint
SET check_function_bodies = off;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.current_login() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.login', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.is_member(target text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM app.org_members m WHERE m.org = target AND m.login = authz.current_login())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.is_admin(target text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.org_members m
    WHERE m.org = target AND m.login = authz.current_login() AND m.role = 'admin'
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.can_read(target text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM app.repo_access a WHERE a.repo = target AND a.login = authz.current_login())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.reaches_installation(target bigint) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.repo_access a WHERE a.installation_id = target AND a.login = authz.current_login()
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION authz.jsonb_tail(arr jsonb, n int) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(e ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(arr) WITH ORDINALITY AS t(e, i)
  WHERE i > jsonb_array_length(arr) - n
$$;
