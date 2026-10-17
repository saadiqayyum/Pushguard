CREATE TABLE "app"."job_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"reason" text NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."job_failures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "job_failures_org_resolved_at_index" ON "app"."job_failures" USING btree ("org","resolved_at");--> statement-breakpoint
CREATE POLICY "job_failures_system" ON "app"."job_failures" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "job_failures_member_read" ON "app"."job_failures" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
ALTER TABLE app.job_failures FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.job_failures TO pushguard_system;
--> statement-breakpoint
GRANT SELECT ON app.job_failures TO pushguard_app;
