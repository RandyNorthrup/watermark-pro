CREATE TABLE `referral_link` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`nonce` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_link_user_unique` ON `referral_link` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `referral_link_token_unique` ON `referral_link` (`token_hash`);--> statement-breakpoint
ALTER TABLE `site_invitation` ADD `referral_id` text REFERENCES referral_link(id);