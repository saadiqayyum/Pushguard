ALTER TABLE app.rule_shadow_hits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.rule_shadow_hits TO pushguard_system;
--> statement-breakpoint
-- The rule editor lists published check ids; users never read check bodies, so
-- the app role gets this function and not the table.
CREATE OR REPLACE FUNCTION app.published_check_ids() RETURNS TABLE (id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT DISTINCT c.id FROM app.check_scripts c WHERE c.status = 'published' ORDER BY c.id LIMIT 200
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.published_check_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.published_check_ids() TO pushguard_app, pushguard_system;
