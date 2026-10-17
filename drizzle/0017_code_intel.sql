CREATE TABLE "app"."code_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo" text NOT NULL,
	"path" text NOT NULL,
	"symbol" text,
	"kind" text NOT NULL,
	"detail" text NOT NULL,
	"line" integer,
	"commit" text NOT NULL,
	"author" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."code_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."code_symbols" (
	"repo" text NOT NULL,
	"path" text NOT NULL,
	"blob_sha" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"line" integer NOT NULL,
	"end_line" integer,
	CONSTRAINT "code_symbols_repo_path_name_role_line_pk" PRIMARY KEY("repo","path","name","role","line")
);
--> statement-breakpoint
ALTER TABLE "app"."code_symbols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "code_facts_repo_path_index" ON "app"."code_facts" USING btree ("repo","path");--> statement-breakpoint
CREATE INDEX "code_facts_repo_symbol_index" ON "app"."code_facts" USING btree ("repo","symbol");--> statement-breakpoint
CREATE INDEX "code_facts_repo_kind_at_index" ON "app"."code_facts" USING btree ("repo","kind","at");--> statement-breakpoint
CREATE INDEX "code_symbols_repo_name_role_index" ON "app"."code_symbols" USING btree ("repo","name","role");--> statement-breakpoint
CREATE POLICY "code_facts_system" ON "app"."code_facts" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "code_facts_readable" ON "app"."code_facts" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(repo));--> statement-breakpoint
CREATE POLICY "code_symbols_system" ON "app"."code_symbols" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "code_symbols_readable" ON "app"."code_symbols" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.can_read(repo));