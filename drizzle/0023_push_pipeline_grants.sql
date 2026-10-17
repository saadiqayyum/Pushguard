ALTER TABLE app.action_pin_verdicts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.merged_commits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.pending_ai_reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE app.repo_locks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.action_pin_verdicts, app.merged_commits, app.pending_ai_reviews, app.repo_locks TO pushguard_system;
