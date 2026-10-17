CREATE TABLE "app"."rule_shadow_hits" (
	"row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_shadow_hits_id_version_repo_sha_unique" UNIQUE("id","version","repo","sha")
);
--> statement-breakpoint
ALTER TABLE "app"."rule_shadow_hits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."contributor_drafts" ADD COLUMN "rule_id" text;--> statement-breakpoint
ALTER TABLE "app"."contributor_drafts" ADD COLUMN "rule_version" integer;--> statement-breakpoint
CREATE INDEX "rule_shadow_hits_id_version_at_index" ON "app"."rule_shadow_hits" USING btree ("id","version","at");--> statement-breakpoint
CREATE POLICY "rule_shadow_hits_system" ON "app"."rule_shadow_hits" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);