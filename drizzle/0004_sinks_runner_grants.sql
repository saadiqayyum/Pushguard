ALTER TABLE app.alert_sinks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.runner_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.alert_sinks, app.runner_jobs TO pushguard_system;
--> statement-breakpoint
-- Every column but the sealed three, as with model keys.
GRANT SELECT (id, org, label, host, hint, created_by, created_at), INSERT, DELETE
  ON app.alert_sinks TO pushguard_app;
--> statement-breakpoint
-- Filing a scan's findings as an issue is a system write. The user can only ask
-- for it, for their own finished scan, and is recorded as the filer from the session.
CREATE OR REPLACE FUNCTION app.enqueue_scan_filing(p_scan text, p_repos text[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  who text := authz.current_login();
BEGIN
  IF who IS NULL OR NOT EXISTS (
    SELECT 1 FROM app.scans s WHERE s.id = p_scan AND s.owner = who AND s.status = 'done'
  ) THEN
    RAISE EXCEPTION 'scan not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_repos IS NOT NULL AND cardinality(p_repos) > 50 THEN
    RAISE EXCEPTION 'too many repositories' USING ERRCODE = '22023';
  END IF;
  UPDATE app.scans SET filing_failed = '[]'::jsonb WHERE id = p_scan;
  RETURN pgmq.send('jobs', jsonb_build_object('type', 'file_scan', 'id', p_scan, 'by', who, 'repos', to_jsonb(p_repos)));
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.enqueue_scan_filing(text, text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.enqueue_scan_filing(text, text[]) TO pushguard_app;
