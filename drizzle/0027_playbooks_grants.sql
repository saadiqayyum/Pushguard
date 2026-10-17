ALTER TABLE app.playbooks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.playbook_shadow_hits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.org_playbook_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.check_scripts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.playbooks, app.playbook_shadow_hits, app.org_playbook_settings, app.check_scripts TO pushguard_system;
--> statement-breakpoint
-- The Rules page lists published playbooks inside user requests; the policy limits rows to status = 'published'.
GRANT SELECT ON app.playbooks TO pushguard_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.org_playbook_settings TO pushguard_app;
