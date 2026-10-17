CREATE TABLE "app"."users" (
	"login" text PRIMARY KEY NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."installations" DROP COLUMN "deleted_at";--> statement-breakpoint
CREATE POLICY "users_system" ON "app"."users" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "users_own_select" ON "app"."users" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (login = authz.current_login());--> statement-breakpoint
CREATE POLICY "users_own_insert" ON "app"."users" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (login = authz.current_login());--> statement-breakpoint
CREATE POLICY "users_own_update" ON "app"."users" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (login = authz.current_login()) WITH CHECK (login = authz.current_login());