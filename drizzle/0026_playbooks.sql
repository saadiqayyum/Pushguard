CREATE TABLE "app"."check_scripts" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"language" text NOT NULL,
	"body" text NOT NULL,
	"sha256" text NOT NULL,
	"signature" text,
	"signed_by" text,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "check_scripts_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
ALTER TABLE "app"."check_scripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."org_playbook_settings" (
	"org" text NOT NULL,
	"playbook_id" text NOT NULL,
	"disabled" boolean NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_playbook_settings_org_playbook_id_pk" PRIMARY KEY("org","playbook_id")
);
--> statement-breakpoint
ALTER TABLE "app"."org_playbook_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."playbook_shadow_hits" (
	"row_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_shadow_hits_id_version_repo_sha_unique" UNIQUE("id","version","repo","sha")
);
--> statement-breakpoint
ALTER TABLE "app"."playbook_shadow_hits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."playbooks" (
	"id" text NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"status" text NOT NULL,
	"signature" text,
	"signed_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "playbooks_id_version_pk" PRIMARY KEY("id","version")
);
--> statement-breakpoint
ALTER TABLE "app"."playbooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ADD COLUMN "phases" text[];--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ADD COLUMN "check_script_id" text;--> statement-breakpoint
ALTER TABLE "app"."runner_jobs" ADD COLUMN "check_script_version" integer;--> statement-breakpoint
CREATE INDEX "playbook_shadow_hits_id_version_at_index" ON "app"."playbook_shadow_hits" USING btree ("id","version","at");--> statement-breakpoint
CREATE POLICY "check_scripts_system" ON "app"."check_scripts" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "org_playbook_settings_system" ON "app"."org_playbook_settings" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "org_playbook_settings_member_read" ON "app"."org_playbook_settings" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
CREATE POLICY "org_playbook_settings_admin_insert" ON "app"."org_playbook_settings" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "org_playbook_settings_admin_update" ON "app"."org_playbook_settings" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "org_playbook_settings_admin_delete" ON "app"."org_playbook_settings" AS PERMISSIVE FOR DELETE TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "playbook_shadow_hits_system" ON "app"."playbook_shadow_hits" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "playbooks_system" ON "app"."playbooks" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "playbooks_published_read" ON "app"."playbooks" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (status = 'published');