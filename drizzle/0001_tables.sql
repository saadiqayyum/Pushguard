CREATE TABLE "app"."ai_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"label" text NOT NULL,
	"provider" text NOT NULL,
	"key_hint" text NOT NULL,
	"model" text NOT NULL,
	"effort" text NOT NULL,
	"base_url" text,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ai_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."ai_rules" (
	"org" text NOT NULL,
	"rule_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_rules_org_rule_id_pk" PRIMARY KEY("org","rule_id")
);
--> statement-breakpoint
ALTER TABLE "app"."ai_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."ai_usage" (
	"org" text NOT NULL,
	"day" text NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_org_day_pk" PRIMARY KEY("org","day")
);
--> statement-breakpoint
ALTER TABLE "app"."ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."alerts" (
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"org" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"rule_ids" text[] NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"push" jsonb,
	"activity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pull_request" jsonb,
	"source" text NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"sightings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"assignees" text[] DEFAULT '{}' NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_repo_number_pk" PRIMARY KEY("repo","number")
);
--> statement-breakpoint
ALTER TABLE "app"."alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."code_index" (
	"repo" text NOT NULL,
	"path" text NOT NULL,
	"blob_sha" text NOT NULL,
	"size" integer NOT NULL,
	"tokens" text[] NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_index_repo_path_pk" PRIMARY KEY("repo","path")
);
--> statement-breakpoint
ALTER TABLE "app"."code_index" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."disabled_packs" (
	"org" text NOT NULL,
	"pack" text NOT NULL,
	"disabled_by" text NOT NULL,
	"disabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disabled_packs_org_pack_pk" PRIMARY KEY("org","pack")
);
--> statement-breakpoint
ALTER TABLE "app"."disabled_packs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."installations" (
	"org" text PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"repos" text[],
	"teams" text[],
	"account_type" text,
	"alert_mention" text,
	"ai_default_key" text,
	"installed_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installations_installationId_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
ALTER TABLE "app"."installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."org_members" (
	"org" text NOT NULL,
	"login" text NOT NULL,
	"role" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_login_pk" PRIMARY KEY("org","login")
);
--> statement-breakpoint
ALTER TABLE "app"."org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."pull_requests" (
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"org" text NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"head_ref" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_ref" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"url" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pull_requests_repo_number_pk" PRIMARY KEY("repo","number")
);
--> statement-breakpoint
ALTER TABLE "app"."pull_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."push_actors" (
	"repo" text NOT NULL,
	"sender" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pushes" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "push_actors_repo_sender_pk" PRIMARY KEY("repo","sender")
);
--> statement-breakpoint
ALTER TABLE "app"."push_actors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "app"."rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."repo_access" (
	"login" text NOT NULL,
	"repo" text NOT NULL,
	"org" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"grants" text[] DEFAULT '{}' NOT NULL,
	"write" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_access_login_repo_pk" PRIMARY KEY("login","repo")
);
--> statement-breakpoint
ALTER TABLE "app"."repo_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."repos" (
	"full_name" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"branches" text[] DEFAULT '{}' NOT NULL,
	"branches_truncated" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"private" boolean,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."repos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"sha" text NOT NULL,
	"base_sha" text,
	"source" text NOT NULL,
	"pull_request" jsonb,
	"rules" jsonb NOT NULL,
	"seeds" text[] DEFAULT '{}' NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."review_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org" text NOT NULL,
	"rule_id" text NOT NULL,
	"body" jsonb,
	"action" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."rule_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rules" (
	"org" text NOT NULL,
	"rule_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_org_rule_id_pk" PRIMARY KEY("org","rule_id")
);
--> statement-breakpoint
ALTER TABLE "app"."rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."scans" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"target" text NOT NULL,
	"branch" text,
	"scope" text NOT NULL,
	"ai_key" text,
	"status" text NOT NULL,
	"active" boolean,
	"installation_id" bigint NOT NULL,
	"account" text NOT NULL,
	"repos" text[] DEFAULT '{}' NOT NULL,
	"scanned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skipped_repos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"error_code" text,
	"filed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "alerts_org_created_at_index" ON "app"."alerts" USING btree ("org","created_at");--> statement-breakpoint
CREATE INDEX "alerts_rule_ids_index" ON "app"."alerts" USING gin ("rule_ids");--> statement-breakpoint
CREATE INDEX "alerts_push_after_idx" ON "app"."alerts" USING btree ("repo",(push->>'after'));--> statement-breakpoint
CREATE INDEX "code_index_tokens_index" ON "app"."code_index" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "pull_requests_org_updated_at_index" ON "app"."pull_requests" USING btree ("org","updated_at");--> statement-breakpoint
CREATE INDEX "repo_access_repo_index" ON "app"."repo_access" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "repo_access_login_installation_id_index" ON "app"."repo_access" USING btree ("login","installation_id");--> statement-breakpoint
CREATE INDEX "repos_org_index" ON "app"."repos" USING btree ("org");--> statement-breakpoint
CREATE INDEX "review_sessions_org_created_at_index" ON "app"."review_sessions" USING btree ("org","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_sessions_one_queued" ON "app"."review_sessions" USING btree ("repo") WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX "rule_versions_org_rule_id_changed_at_index" ON "app"."rule_versions" USING btree ("org","rule_id","changed_at");--> statement-breakpoint
CREATE INDEX "scans_owner_created_at_index" ON "app"."scans" USING btree ("owner","created_at");--> statement-breakpoint
CREATE INDEX "scans_status_created_at_index" ON "app"."scans" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scans_one_active_per_owner" ON "app"."scans" USING btree ("owner") WHERE active;--> statement-breakpoint
CREATE POLICY "ai_keys_system" ON "app"."ai_keys" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "ai_keys_admin" ON "app"."ai_keys" AS PERMISSIVE FOR ALL TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "ai_rules_system" ON "app"."ai_rules" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "ai_rules_member_read" ON "app"."ai_rules" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
CREATE POLICY "ai_rules_admin_insert" ON "app"."ai_rules" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "ai_rules_admin_update" ON "app"."ai_rules" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "ai_rules_admin_delete" ON "app"."ai_rules" AS PERMISSIVE FOR DELETE TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "ai_usage_system" ON "app"."ai_usage" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "alerts_system" ON "app"."alerts" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "alerts_readable" ON "app"."alerts" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(repo));--> statement-breakpoint
CREATE POLICY "alerts_archive" ON "app"."alerts" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.can_read(repo)) WITH CHECK (authz.can_read(repo));--> statement-breakpoint
CREATE POLICY "code_index_system" ON "app"."code_index" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "deliveries_system" ON "app"."deliveries" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "disabled_packs_system" ON "app"."disabled_packs" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "disabled_packs_member_read" ON "app"."disabled_packs" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
CREATE POLICY "disabled_packs_admin_insert" ON "app"."disabled_packs" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "disabled_packs_admin_update" ON "app"."disabled_packs" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "disabled_packs_admin_delete" ON "app"."disabled_packs" AS PERMISSIVE FOR DELETE TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "installations_system" ON "app"."installations" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "installations_reach" ON "app"."installations" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org) or authz.reaches_installation(installation_id));--> statement-breakpoint
CREATE POLICY "installations_admin_update" ON "app"."installations" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "org_members_system" ON "app"."org_members" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "org_members_own" ON "app"."org_members" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (login = authz.current_login());--> statement-breakpoint
CREATE POLICY "pull_requests_system" ON "app"."pull_requests" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "pull_requests_readable" ON "app"."pull_requests" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(repo));--> statement-breakpoint
CREATE POLICY "push_actors_system" ON "app"."push_actors" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rate_limits_system" ON "app"."rate_limits" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "repo_access_system" ON "app"."repo_access" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "repo_access_own" ON "app"."repo_access" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (login = authz.current_login());--> statement-breakpoint
CREATE POLICY "repos_system" ON "app"."repos" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "repos_readable" ON "app"."repos" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(full_name));--> statement-breakpoint
CREATE POLICY "review_sessions_system" ON "app"."review_sessions" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rule_versions_system" ON "app"."rule_versions" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rule_versions_member_read" ON "app"."rule_versions" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
CREATE POLICY "rule_versions_admin_insert" ON "app"."rule_versions" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "rule_versions_admin_update" ON "app"."rule_versions" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "rule_versions_admin_delete" ON "app"."rule_versions" AS PERMISSIVE FOR DELETE TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "rules_system" ON "app"."rules" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rules_member_read" ON "app"."rules" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_member(org));--> statement-breakpoint
CREATE POLICY "rules_admin_insert" ON "app"."rules" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "rules_admin_update" ON "app"."rules" AS PERMISSIVE FOR UPDATE TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "rules_admin_delete" ON "app"."rules" AS PERMISSIVE FOR DELETE TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "scans_system" ON "app"."scans" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "scans_own_read" ON "app"."scans" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (owner = authz.current_login());--> statement-breakpoint
CREATE POLICY "scans_own_insert" ON "app"."scans" AS PERMISSIVE FOR INSERT TO "pushguard_app" WITH CHECK (owner = authz.current_login());