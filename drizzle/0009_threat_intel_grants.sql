ALTER TABLE app.dependency_inventory FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.malicious_packages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.threat_actors FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.threat_indicators FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.dependency_inventory, app.malicious_packages, app.threat_actors, app.threat_indicators TO pushguard_system;
--> statement-breakpoint
GRANT SELECT ON app.dependency_inventory TO pushguard_app;
