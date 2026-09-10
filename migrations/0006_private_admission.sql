CREATE TABLE `private_workspace` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `private_workspace_organization_unique` ON `private_workspace` (`organization_id`);--> statement-breakpoint
CREATE TABLE `site_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_user_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_invitation_token_unique` ON `site_invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `site_invitation_inviter_idx` ON `site_invitation` (`inviter_id`);