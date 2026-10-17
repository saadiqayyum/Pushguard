ALTER TABLE app.users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users TO pushguard_system;
--> statement-breakpoint
-- Users accept terms for their own login only; the policies pin the row, the grants pin the columns.
GRANT SELECT (login, terms_accepted_at, terms_version, created_at), INSERT (login, terms_accepted_at, terms_version),
  UPDATE (terms_accepted_at, terms_version) ON app.users TO pushguard_app;
