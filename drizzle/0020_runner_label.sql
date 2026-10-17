ALTER TABLE "app"."installations" ADD COLUMN "runner_repo" text;--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ADD COLUMN "runner_repo" text;--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ADD COLUMN "label" jsonb;
--> statement-breakpoint
GRANT UPDATE (runner_repo) ON app.installations TO pushguard_app;
