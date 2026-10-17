-- realtime.send writes to realtime.messages, which has row-level security, and
-- reports a refusal only as a notice. Only the system role may broadcast.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'pushguard_system_broadcast'
  ) THEN
    CREATE POLICY pushguard_system_broadcast ON realtime.messages
      FOR INSERT TO pushguard_system WITH CHECK (extension = 'broadcast');
  END IF;
END $$;
