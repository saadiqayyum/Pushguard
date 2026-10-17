ALTER TABLE app.code_symbols FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.code_facts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.code_symbols, app.code_facts TO pushguard_system;
--> statement-breakpoint
GRANT SELECT ON app.code_symbols, app.code_facts TO pushguard_app;
