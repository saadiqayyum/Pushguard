ALTER TABLE app.tag_snapshots FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.chain_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.tag_snapshots, app.chain_events TO pushguard_system;
