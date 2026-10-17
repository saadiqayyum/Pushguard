CREATE TABLE "app"."contributor_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"requested_by" text NOT NULL,
	"input_urls" jsonb NOT NULL,
	"playbook_id" text,
	"playbook_version" integer,
	"body" jsonb,
	"reasoning" text NOT NULL,
	"fixture_results" jsonb,
	"problems" jsonb NOT NULL,
	"dropped_urls" jsonb NOT NULL,
	"valid" boolean NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."contributor_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."platform_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."platform_rules" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"status" text NOT NULL,
	"signature" text,
	"signed_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "platform_rules_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
ALTER TABLE "app"."platform_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "contributor_drafts_state_created_at_index" ON "app"."contributor_drafts" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_at_index" ON "app"."platform_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "platform_audit_target_action_at_index" ON "app"."platform_audit" USING btree ("target","action","at");--> statement-breakpoint
CREATE POLICY "contributor_drafts_system" ON "app"."contributor_drafts" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_audit_system" ON "app"."platform_audit" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_rules_system" ON "app"."platform_rules" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_rules_published_read" ON "app"."platform_rules" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (status = 'published');