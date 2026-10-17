CREATE TABLE "app"."socket_results" (
	"purl" text PRIMARY KEY NOT NULL,
	"alert_types" text[] DEFAULT '{}' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."socket_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "socket_results_system" ON "app"."socket_results" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);