CREATE TABLE "app"."action_pin_verdicts" (
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"reachable" boolean NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_pin_verdicts_repo_sha_pk" PRIMARY KEY("repo","sha")
);
--> statement-breakpoint
ALTER TABLE "app"."action_pin_verdicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."merged_commits" (
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"number" integer NOT NULL,
	"merged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merged_commits_repo_sha_pk" PRIMARY KEY("repo","sha")
);
--> statement-breakpoint
ALTER TABLE "app"."merged_commits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."pending_ai_reviews" (
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"review" jsonb NOT NULL,
	"queued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_ai_reviews_repo_branch_pk" PRIMARY KEY("repo","branch")
);
--> statement-breakpoint
ALTER TABLE "app"."pending_ai_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."repo_locks" (
	"repo" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."repo_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "action_pin_verdicts_system" ON "app"."action_pin_verdicts" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "merged_commits_system" ON "app"."merged_commits" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "pending_ai_reviews_system" ON "app"."pending_ai_reviews" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "repo_locks_system" ON "app"."repo_locks" AS PERMISSIVE FOR ALL TO "pushguard_system" USING (true) WITH CHECK (true);