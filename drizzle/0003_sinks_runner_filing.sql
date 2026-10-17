CREATE TABLE "app"."alert_sinks" (
	"id" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"label" text NOT NULL,
	"host" text NOT NULL,
	"hint" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."alert_sinks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."runner_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" bigint NOT NULL,
	"org" text NOT NULL,
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'dispatched' NOT NULL,
	"fetch_nonce_hash" text NOT NULL,
	"fetch_nonce_expires_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone,
	"report_token_hash" text,
	"report_expires_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."scans" ADD COLUMN "filing_failed" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runner_jobs_fetch_nonce_hash_index" ON "app"."runner_jobs" USING btree ("fetch_nonce_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_jobs_report_token_hash_index" ON "app"."runner_jobs" USING btree ("report_token_hash");--> statement-breakpoint
CREATE INDEX "runner_jobs_status_created_at_index" ON "app"."runner_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE POLICY "alert_sinks_system" ON "app"."alert_sinks" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "alert_sinks_admin" ON "app"."alert_sinks" AS PERMISSIVE FOR ALL TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "runner_jobs_system" ON "app"."runner_jobs" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);