CREATE TABLE `upload_reservation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`keys` text NOT NULL,
	`bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_reservation_org_idx` ON `upload_reservation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `upload_reservation_expiry_idx` ON `upload_reservation` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_reservation_pending_unique` ON `upload_reservation` (`organization_id`,`kind`,`upload_id`) WHERE "upload_reservation"."status" = 'pending';--> statement-breakpoint
ALTER TABLE `photo` ADD `thumbnail_size` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Legacy rows predate exact thumbnail accounting. Charge the former 1 MiB
-- upload ceiling so an upgrade cannot undercount previously stored objects.
-- All new uploads persist their exact thumbnail size.
UPDATE photo SET thumbnail_size = 1048576;
--> statement-breakpoint
-- Serialize logo/preset races and prevent D1 cascades from orphaning R2 objects.
CREATE TRIGGER watermark_logo_owned_insert BEFORE INSERT ON watermark
WHEN json_extract(NEW.spec, '$.kind') = 'image' AND NOT EXISTS (
  SELECT 1 FROM asset WHERE id = json_extract(NEW.spec, '$.assetId') AND organization_id = NEW.organization_id
)
BEGIN SELECT RAISE(ABORT, 'Watermark logo must belong to the workspace'); END;
--> statement-breakpoint
CREATE TRIGGER watermark_logo_owned_update BEFORE UPDATE OF spec, organization_id ON watermark
WHEN json_extract(NEW.spec, '$.kind') = 'image' AND NOT EXISTS (
  SELECT 1 FROM asset WHERE id = json_extract(NEW.spec, '$.assetId') AND organization_id = NEW.organization_id
)
BEGIN SELECT RAISE(ABORT, 'Watermark logo must belong to the workspace'); END;
--> statement-breakpoint
CREATE TRIGGER asset_referenced_delete BEFORE DELETE ON asset
WHEN EXISTS (SELECT 1 FROM watermark WHERE organization_id = OLD.organization_id AND json_extract(spec, '$.kind') = 'image' AND json_extract(spec, '$.assetId') = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Logo is still used by a saved watermark'); END;
--> statement-breakpoint
CREATE TRIGGER organization_content_delete BEFORE DELETE ON organization
WHEN EXISTS (SELECT 1 FROM photo WHERE organization_id = OLD.id)
  OR EXISTS (SELECT 1 FROM asset WHERE organization_id = OLD.id)
  OR EXISTS (SELECT 1 FROM watermark WHERE organization_id = OLD.id)
  OR EXISTS (SELECT 1 FROM upload_reservation WHERE organization_id = OLD.id AND status IN ('pending', 'cleanup'))
BEGIN SELECT RAISE(ABORT, 'Remove saved content and finish storage cleanup before deleting the workspace'); END;
