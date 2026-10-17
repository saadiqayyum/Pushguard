-- Jobs and webhooks announce "something changed" on a per-org broadcast topic.
-- Guarded so a Postgres without Supabase Realtime still migrates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'realtime' AND p.proname = 'send'
  ) THEN
    GRANT USAGE ON SCHEMA realtime TO pushguard_system;
    GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO pushguard_system;
    GRANT INSERT ON realtime.messages TO pushguard_system;
  END IF;
END $$;
