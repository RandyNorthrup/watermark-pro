-- Default workspaces remain private until their owner explicitly grants access.
-- No existing membership or account is changed by this migration.
CREATE TABLE `workspace_access_link` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organization` (`id`) ON DELETE cascade,
  `created_by` text NOT NULL REFERENCES `user` (`id`) ON DELETE cascade,
  `token_hash` text NOT NULL,
  `role` text NOT NULL,
  `email` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  `revoked_at` integer,
  `accepted_user_id` text REFERENCES `user` (`id`) ON DELETE set null,
  `site_invitation_id` text REFERENCES `site_invitation` (`id`) ON DELETE set null,
  CONSTRAINT `workspace_access_link_role` CHECK (`role` in ('viewer', 'editor'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_access_link_token_unique` ON `workspace_access_link` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `workspace_access_link_workspace_idx` ON `workspace_access_link` (`organization_id`);
