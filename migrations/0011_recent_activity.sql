CREATE TABLE `recent_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`used_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recent_activity_kind" CHECK("recent_activity"."kind" in ('photo', 'preset'))
);
--> statement-breakpoint
CREATE INDEX `recent_activity_owner_org_time` ON `recent_activity` (`user_id`,`organization_id`,`used_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `recent_activity_resource_unique` ON `recent_activity` (`user_id`,`organization_id`,`kind`,`resource_id`);--> statement-breakpoint
CREATE TABLE `recent_view_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`view` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recent_view_valid" CHECK("recent_view_preference"."view" in ('thumbnails', 'list', 'details'))
);
