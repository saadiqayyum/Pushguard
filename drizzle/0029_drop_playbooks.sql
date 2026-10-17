DROP POLICY "org_playbook_settings_system" ON "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP POLICY "org_playbook_settings_member_read" ON "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP POLICY "org_playbook_settings_admin_insert" ON "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP POLICY "org_playbook_settings_admin_update" ON "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP POLICY "org_playbook_settings_admin_delete" ON "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP TABLE "app"."org_playbook_settings" CASCADE;--> statement-breakpoint
DROP POLICY "playbook_shadow_hits_system" ON "app"."playbook_shadow_hits" CASCADE;--> statement-breakpoint
DROP TABLE "app"."playbook_shadow_hits" CASCADE;--> statement-breakpoint
DROP POLICY "playbooks_system" ON "app"."playbooks" CASCADE;--> statement-breakpoint
DROP POLICY "playbooks_published_read" ON "app"."playbooks" CASCADE;--> statement-breakpoint
DROP TABLE "app"."playbooks" CASCADE;--> statement-breakpoint
ALTER TABLE "app"."contributor_drafts" DROP COLUMN "playbook_id";--> statement-breakpoint
ALTER TABLE "app"."contributor_drafts" DROP COLUMN "playbook_version";