-- Anchor one explicitly chosen site administrator. Workspace ownership is separate.
CREATE TABLE `site_owner` (
  `id` integer PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "site_owner_singleton" CHECK("site_owner"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE _site_owner_migration_guard (ok INTEGER NOT NULL CHECK (ok = 1));
--> statement-breakpoint
INSERT INTO _site_owner_migration_guard (ok)
SELECT CASE WHEN (SELECT COUNT(*) FROM user) = 0
  OR (SELECT COUNT(*) FROM user WHERE instr(',' || coalesce(role, '') || ',', ',admin,') > 0) = 1
THEN 1 ELSE 0 END;
--> statement-breakpoint
-- An occupied database must already have exactly one administrator. Selecting a
-- different owner or resolving multiple administrators is an explicit operator
-- action before this migration; no user identity is embedded in public source.
UPDATE user SET role = 'admin' WHERE instr(',' || coalesce(role, '') || ',', ',admin,') > 0;
--> statement-breakpoint
INSERT INTO site_owner (id, user_id) SELECT 1, id FROM user WHERE role = 'admin';
--> statement-breakpoint
DROP TABLE _site_owner_migration_guard;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_single_site_admin` ON `user` ((1)) WHERE instr(',' || coalesce("user"."role", '') || ',', ',admin,') > 0;
--> statement-breakpoint
CREATE TRIGGER user_site_admin_insert_guard BEFORE INSERT ON user
WHEN instr(',' || coalesce(NEW.role, '') || ',', ',admin,') > 0
  AND (NEW.role <> 'admin' OR (EXISTS (SELECT 1 FROM site_owner) AND NEW.id <> (SELECT user_id FROM site_owner WHERE id = 1)))
BEGIN SELECT RAISE(ABORT, 'Only the anchored site owner may be administrator'); END;
--> statement-breakpoint
CREATE TRIGGER user_site_admin_update_guard BEFORE UPDATE OF role, id ON user
WHEN (instr(',' || coalesce(NEW.role, '') || ',', ',admin,') > 0
  AND (NEW.role <> 'admin' OR (EXISTS (SELECT 1 FROM site_owner) AND NEW.id <> (SELECT user_id FROM site_owner WHERE id = 1))))
  OR (OLD.id = (SELECT user_id FROM site_owner WHERE id = 1) AND (NEW.id <> OLD.id OR coalesce(NEW.role, '') <> 'admin'))
BEGIN SELECT RAISE(ABORT, 'The site administrator cannot be changed or demoted'); END;
--> statement-breakpoint
CREATE TRIGGER user_capture_initial_site_owner AFTER INSERT ON user
WHEN NEW.role = 'admin' AND NOT EXISTS (SELECT 1 FROM site_owner)
BEGIN INSERT INTO site_owner (id, user_id) VALUES (1, NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER user_capture_promoted_site_owner AFTER UPDATE OF role ON user
WHEN NEW.role = 'admin' AND NOT EXISTS (SELECT 1 FROM site_owner)
BEGIN INSERT INTO site_owner (id, user_id) VALUES (1, NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER site_owner_no_update BEFORE UPDATE ON site_owner
BEGIN SELECT RAISE(ABORT, 'The site owner is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER site_owner_no_delete BEFORE DELETE ON site_owner
BEGIN SELECT RAISE(ABORT, 'The site owner cannot be removed'); END;
