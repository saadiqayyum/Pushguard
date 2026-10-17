CREATE TABLE "app"."chain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org" text NOT NULL,
	"repo" text,
	"kind" text NOT NULL,
	"login" text,
	"detail" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."chain_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."tag_snapshots" (
	"repo" text NOT NULL,
	"tag" text NOT NULL,
	"sha" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_snapshots_repo_tag_pk" PRIMARY KEY("repo","tag")
);
--> statement-breakpoint
ALTER TABLE "app"."tag_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "chain_events_org_at_index" ON "app"."chain_events" USING btree ("org","at");--> statement-breakpoint
CREATE POLICY "chain_events_system" ON "app"."chain_events" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "tag_snapshots_system" ON "app"."tag_snapshots" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);