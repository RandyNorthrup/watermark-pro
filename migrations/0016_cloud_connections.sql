CREATE TABLE `cloud_connection` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`client_id` text,
	`provider_account_id` text,
	`account_label` text,
	`access_cipher` text,
	`refresh_cipher` text,
	`access_expires_at` integer,
	`scopes` text DEFAULT '' NOT NULL,
	`refresh_lease_id` text,
	`refresh_lease_expires_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cloud_connection_provider" CHECK("cloud_connection"."provider" in ('google', 'dropbox', 'onedrive')),
	CONSTRAINT "cloud_connection_status" CHECK("cloud_connection"."status" in ('disconnected', 'connected', 'reconnect'))
);

--> statement-breakpoint
CREATE TABLE `cloud_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`provider` text NOT NULL,
	`state_hash` text NOT NULL,
	`verifier_cipher` text NOT NULL,
	`generation` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_attempt_state_unique` ON `cloud_attempt` (`state_hash`);
--> statement-breakpoint
CREATE INDEX `cloud_attempt_expiry_idx` ON `cloud_attempt` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `cloud_attempt_owner_provider_idx` ON `cloud_attempt` (`user_id`,`provider`);
