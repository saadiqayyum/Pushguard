ALTER TABLE app.socket_results FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.socket_results TO pushguard_system;
