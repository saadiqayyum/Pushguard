ALTER TABLE app.mcp_tokens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.mcp_tokens TO pushguard_system;
--> statement-breakpoint
-- Every column but the hash, so no user query can read one back.
GRANT SELECT (id, org, label, hint, created_by, created_at, last_used_at), INSERT, DELETE ON app.mcp_tokens TO pushguard_app;
--> statement-breakpoint
GRANT SELECT (max_output_tokens, thinking_budget, timeout_ms), UPDATE (max_output_tokens, thinking_budget, timeout_ms)
  ON app.ai_keys TO pushguard_app;
--> statement-breakpoint
GRANT UPDATE (ai_daily_token_budget, ai_push_token_budget) ON app.installations TO pushguard_app;
--> statement-breakpoint
GRANT SELECT (org, day, reviews, input_tokens, output_tokens) ON app.ai_usage TO pushguard_app;
