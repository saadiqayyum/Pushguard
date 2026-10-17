-- Owners skip row-level security unless it is forced.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- Supabase's Data API serves whatever anon and authenticated can reach. They reach nothing here.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON SCHEMA app, authz FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app, authz FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app, authz TO pushguard_app, pushguard_system;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA authz TO pushguard_app, pushguard_system;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO pushguard_system;
--> statement-breakpoint
GRANT SELECT ON app.repo_access, app.org_members, app.repos, app.alerts, app.pull_requests,
  app.installations, app.rules, app.rule_versions, app.disabled_packs, app.ai_rules, app.scans
  TO pushguard_app;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON app.rules, app.rule_versions, app.disabled_packs, app.ai_rules TO pushguard_app;
--> statement-breakpoint
GRANT UPDATE (archived_at, archived_by, updated_at) ON app.alerts TO pushguard_app;
--> statement-breakpoint
GRANT UPDATE (alert_mention, ai_default_key, updated_at) ON app.installations TO pushguard_app;
--> statement-breakpoint
GRANT INSERT ON app.scans TO pushguard_app;
--> statement-breakpoint
-- Every column but the sealed three. No user query can select a key.
GRANT SELECT (id, org, label, provider, key_hint, model, effort, base_url, added_by, added_at),
  INSERT, DELETE, UPDATE (label, model, effort, base_url)
  ON app.ai_keys TO pushguard_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.hit_rate_limit(p_key text, p_window int)
RETURNS TABLE (count int, reset_in int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window) * p_window);
BEGIN
  DELETE FROM app.rate_limits r WHERE r.key = p_key AND r.window_start < w;
  RETURN QUERY
    INSERT INTO app.rate_limits AS r (key, window_start, count) VALUES (p_key, w, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
    RETURNING r.count, (extract(epoch FROM w)::int + p_window - extract(epoch FROM now())::int);
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.hit_rate_limit(text, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.hit_rate_limit(text, int) TO pushguard_app, pushguard_system;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgmq;
--> statement-breakpoint
SELECT pgmq.create('jobs');
--> statement-breakpoint
GRANT USAGE ON SCHEMA pgmq TO pushguard_system;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgmq TO pushguard_system;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgmq TO pushguard_system;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO pushguard_system;
--> statement-breakpoint
-- The only job a user can queue: their own scan. Raw queue access would let a
-- user forge a push job that then runs with system rights.
CREATE OR REPLACE FUNCTION app.enqueue_scan(p_scan text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.scans s WHERE s.id = p_scan AND s.owner = authz.current_login() AND s.status = 'queued'
  ) THEN
    RAISE EXCEPTION 'scan not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN pgmq.send('jobs', jsonb_build_object('type', 'scan', 'id', p_scan));
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.enqueue_scan(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.enqueue_scan(text) TO pushguard_app;
--> statement-breakpoint
SET search_path = public, extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_net;
--> statement-breakpoint
-- URL and bearer come from Vault (jobs_run_url, jobs_run_secret), never the repo.
CREATE OR REPLACE FUNCTION app.post_jobs_run() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  url text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jobs_run_url');
  secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jobs_run_secret');
BEGIN
  IF url IS NULL OR secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := url,
    headers := jsonb_build_object('authorization', 'Bearer ' || secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.post_jobs_run() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.wake_jobs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.post_jobs_run();
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER wake_jobs AFTER INSERT ON pgmq.q_jobs FOR EACH STATEMENT EXECUTE FUNCTION app.wake_jobs();
--> statement-breakpoint
-- A delayed or retried job has no insert to wake it when it becomes visible.
-- This calls out only when such a job is due; an empty queue costs no request.
CREATE OR REPLACE FUNCTION app.wake_due_jobs() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pgmq.q_jobs WHERE vt <= now()) THEN
    PERFORM app.post_jobs_run();
  END IF;
END $$;
--> statement-breakpoint
SET search_path = public, extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_cron;
--> statement-breakpoint
SELECT cron.schedule('pushguard_wake_due_jobs', '* * * * *', 'SELECT app.wake_due_jobs()');
