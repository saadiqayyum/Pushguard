ALTER TABLE app.platform_audit FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.platform_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.contributor_drafts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.platform_audit, app.platform_rules, app.contributor_drafts TO pushguard_system;
--> statement-breakpoint
-- Published default-rule overrides are read by every org's rules loader, inside user requests.
GRANT SELECT ON app.platform_rules TO pushguard_app;
