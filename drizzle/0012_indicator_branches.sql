ALTER TABLE "app"."installations" ADD COLUMN "indicator_branches" text[];--> statement-breakpoint
GRANT UPDATE (indicator_branches) ON app.installations TO pushguard_app;
