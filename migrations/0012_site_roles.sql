-- Preserve the previously selected account; never guess an owner from an email or workspace role.
CREATE TABLE _site_roles_migration_guard (ok INTEGER NOT NULL CHECK (ok = 1));
--> statement-breakpoint
INSERT INTO _site_roles_migration_guard (ok)
SELECT CASE WHEN
  ((SELECT COUNT(*) FROM user) = 0 AND (SELECT COUNT(*) FROM site_owner) = 0)
  OR ((SELECT COUNT(*) FROM site_owner) = 1 AND EXISTS (
    SELECT 1 FROM user WHERE id = (SELECT user_id FROM site_owner WHERE id = 1)
      AND role = 'admin' AND coalesce(banned, 0) = 0
  )) THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TRIGGER user_site_admin_insert_guard;
--> statement-breakpoint
DROP TRIGGER user_site_admin_update_guard;
--> statement-breakpoint
DROP TRIGGER user_capture_initial_site_owner;
--> statement-breakpoint
DROP TRIGGER user_capture_promoted_site_owner;
--> statement-breakpoint
DROP INDEX user_single_site_admin;
--> statement-breakpoint
-- Exactly one owner and zero administrators at the transition. Later admin
-- appointments require explicit authenticated management operations.
UPDATE user SET role = CASE
  WHEN id = (SELECT user_id FROM site_owner WHERE id = 1) THEN 'owner'
  ELSE 'user' END;
--> statement-breakpoint
CREATE UNIQUE INDEX user_single_site_owner ON user ((1)) WHERE role = 'owner';
--> statement-breakpoint
ALTER TABLE site_invitation ADD role text DEFAULT 'user' NOT NULL
  CONSTRAINT site_invitation_role CHECK (role IN ('user', 'admin'));
--> statement-breakpoint
CREATE TRIGGER user_site_role_insert_guard BEFORE INSERT ON user
WHEN coalesce(NEW.role, 'user') NOT IN ('owner', 'admin', 'user')
  OR (NEW.role = 'owner' AND EXISTS (SELECT 1 FROM site_owner)
    AND NEW.id <> (SELECT user_id FROM site_owner WHERE id = 1))
  OR (NEW.role = 'admin' AND NOT EXISTS (SELECT 1 FROM site_owner))
  OR (NEW.role = 'owner' AND coalesce(NEW.banned, 0) <> 0)
BEGIN SELECT RAISE(ABORT, 'Invalid site role or owner binding'); END;
--> statement-breakpoint
CREATE TRIGGER user_site_role_update_guard BEFORE UPDATE OF role, id, banned ON user
WHEN coalesce(NEW.role, 'user') NOT IN ('owner', 'admin', 'user')
  OR (NEW.role = 'owner' AND EXISTS (SELECT 1 FROM site_owner)
    AND NEW.id <> (SELECT user_id FROM site_owner WHERE id = 1))
  OR (NEW.role = 'admin' AND NOT EXISTS (SELECT 1 FROM site_owner))
  OR (OLD.id = (SELECT user_id FROM site_owner WHERE id = 1)
    AND (NEW.id <> OLD.id OR coalesce(NEW.role, '') <> 'owner' OR coalesce(NEW.banned, 0) <> 0))
BEGIN SELECT RAISE(ABORT, 'The site owner cannot be changed, demoted, or banned'); END;
--> statement-breakpoint
CREATE TRIGGER user_site_owner_delete_guard BEFORE DELETE ON user
WHEN OLD.id = (SELECT user_id FROM site_owner WHERE id = 1)
BEGIN SELECT RAISE(ABORT, 'The site owner cannot be removed'); END;
--> statement-breakpoint
CREATE TRIGGER user_capture_initial_site_owner AFTER INSERT ON user
WHEN NEW.role = 'owner' AND NOT EXISTS (SELECT 1 FROM site_owner)
BEGIN INSERT INTO site_owner (id, user_id) VALUES (1, NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER user_capture_promoted_site_owner AFTER UPDATE OF role ON user
WHEN NEW.role = 'owner' AND NOT EXISTS (SELECT 1 FROM site_owner)
BEGIN INSERT INTO site_owner (id, user_id) VALUES (1, NEW.id); END;
--> statement-breakpoint
DROP TABLE _site_roles_migration_guard;
