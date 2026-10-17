CREATE TABLE "app"."mcp_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"org" text NOT NULL,
	"label" text NOT NULL,
	"hash" text NOT NULL,
	"hint" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "mcp_tokens_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "app"."mcp_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."ai_keys" ADD COLUMN "max_output_tokens" integer;--> statement-breakpoint
ALTER TABLE "app"."ai_keys" ADD COLUMN "thinking_budget" integer;--> statement-breakpoint
ALTER TABLE "app"."ai_keys" ADD COLUMN "timeout_ms" integer;--> statement-breakpoint
ALTER TABLE "app"."ai_usage" ADD COLUMN "input_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."ai_usage" ADD COLUMN "output_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."ai_usage" ADD COLUMN "reserved_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."installations" ADD COLUMN "ai_daily_token_budget" integer;--> statement-breakpoint
ALTER TABLE "app"."installations" ADD COLUMN "ai_push_token_budget" integer;--> statement-breakpoint
CREATE POLICY "ai_usage_admin_read" ON "app"."ai_usage" AS PERMISSIVE FOR SELECT TO "pushguard_app" USING (authz.is_admin(org));--> statement-breakpoint
CREATE POLICY "mcp_tokens_system" ON "app"."mcp_tokens" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "mcp_tokens_admin" ON "app"."mcp_tokens" AS PERMISSIVE FOR ALL TO "pushguard_app" USING (authz.is_admin(org)) WITH CHECK (authz.is_admin(org));