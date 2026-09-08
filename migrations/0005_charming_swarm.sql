CREATE TABLE `client_error` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`source` text,
	`route` text,
	`user_agent` text,
	`request_id` text,
	`user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `client_error_created_at_idx` ON `client_error` (`created_at`);--> statement-breakpoint
CREATE TABLE `health_check` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	`detail` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_check_created_at_idx` ON `health_check` (`created_at`);