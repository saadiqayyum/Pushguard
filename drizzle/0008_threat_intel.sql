CREATE TABLE "app"."dependency_inventory" (
	"repo" text NOT NULL,
	"manifest_path" text NOT NULL,
	"ecosystem" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"blob_sha" text NOT NULL,
	"indexed_sha" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dependency_inventory_repo_manifest_path_ecosystem_name_version_pk" PRIMARY KEY("repo","manifest_path","ecosystem","name","version")
);
--> statement-breakpoint
ALTER TABLE "app"."dependency_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."malicious_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem" text NOT NULL,
	"name" text NOT NULL,
	"version_range" text,
	"versions" text[] DEFAULT '{}' NOT NULL,
	"source" text NOT NULL,
	"advisory_id" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "malicious_packages_source_advisoryId_ecosystem_name_unique" UNIQUE("source","advisory_id","ecosystem","name")
);
--> statement-breakpoint
ALTER TABLE "app"."malicious_packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."threat_actors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"mitre_id" text,
	"summary" text NOT NULL,
	"references" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."threat_actors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."threat_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"campaign" text NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"first_seen" date,
	"references" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "threat_indicators_kind_value_campaign_unique" UNIQUE("kind","value","campaign")
);
--> statement-breakpoint
ALTER TABLE "app"."threat_indicators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."threat_indicators" ADD CONSTRAINT "threat_indicators_actor_id_threat_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."threat_actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dependency_inventory_ecosystem_name_index" ON "app"."dependency_inventory" USING btree ("ecosystem","name");--> statement-breakpoint
CREATE INDEX "malicious_packages_ecosystem_name_index" ON "app"."malicious_packages" USING btree ("ecosystem","name");--> statement-breakpoint
CREATE INDEX "threat_indicators_actor_id_index" ON "app"."threat_indicators" USING btree ("actor_id");--> statement-breakpoint
CREATE POLICY "dependency_inventory_system" ON "app"."dependency_inventory" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "dependency_inventory_readable" ON "app"."dependency_inventory" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(repo));--> statement-breakpoint
CREATE POLICY "malicious_packages_system" ON "app"."malicious_packages" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "threat_actors_system" ON "app"."threat_actors" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "threat_indicators_system" ON "app"."threat_indicators" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);