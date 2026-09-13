CREATE TABLE `workspace_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`parent_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`version_id` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `workspace_folder`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workspace_folder_kind" CHECK("workspace_folder"."kind" in ('photo', 'preset'))
);

--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_folder_sibling_unique` ON `workspace_folder` (`organization_id`,`kind`,coalesce(`parent_id`, ''),`name_key`);
--> statement-breakpoint
CREATE INDEX `workspace_folder_parent_idx` ON `workspace_folder` (`organization_id`,`kind`,`parent_id`);
--> statement-breakpoint
ALTER TABLE `photo` ADD `folder_id` text REFERENCES workspace_folder(id);
--> statement-breakpoint
ALTER TABLE `photo` ADD `folder_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `watermark` ADD `folder_id` text REFERENCES workspace_folder(id);
--> statement-breakpoint
ALTER TABLE `watermark` ADD `folder_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `watermark_folder_idx` ON `watermark` (`organization_id`,`folder_id`);
--> statement-breakpoint
CREATE INDEX `photo_folder_created_id_idx` ON `photo` (`organization_id`,`folder_id`,`created_at`,`id`);
--> statement-breakpoint
ALTER TABLE `photo` ADD `folder_version_id` text;
--> statement-breakpoint
ALTER TABLE `watermark` ADD `folder_version_id` text;
