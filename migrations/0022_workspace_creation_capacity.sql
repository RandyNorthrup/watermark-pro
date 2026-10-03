-- Creation provenance cannot come from membership, metadata or a paid plan name.
ALTER TABLE organization ADD COLUMN creation_owner_id TEXT REFERENCES user(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE organization ADD COLUMN creation_kind TEXT NOT NULL DEFAULT 'shared'
  CHECK (creation_kind IN ('personal', 'shared', 'historical', 'paid'));
--> statement-breakpoint
UPDATE organization SET creation_kind = CASE
  WHEN EXISTS (SELECT 1 FROM private_workspace pw WHERE pw.organization_id = organization.id)
    THEN 'personal' ELSE 'historical' END,
  creation_owner_id = COALESCE(
    (SELECT user_id FROM private_workspace pw WHERE pw.organization_id = organization.id),
    (SELECT user_id FROM member m WHERE m.organization_id = organization.id AND role = 'owner'
      ORDER BY created_at, id LIMIT 1));
--> statement-breakpoint
CREATE INDEX organization_creation_owner_kind_idx ON organization (creation_owner_id, creation_kind);
--> statement-breakpoint
-- Personal preparation is idempotent and preserves legacy verification state.
-- Shared creation requires live private admission and an unused creation slot.
CREATE TRIGGER workspace_creation_capacity_insert
BEFORE INSERT ON organization
WHEN NOT (
  (NEW.creation_kind = 'personal'
    AND EXISTS (SELECT 1 FROM user WHERE id = NEW.creation_owner_id)
    AND NEW.id = 'personal-' || NEW.creation_owner_id
    AND NEW.slug = NEW.id)
  OR (NEW.creation_kind = 'shared'
    AND EXISTS (SELECT 1 FROM user WHERE id = NEW.creation_owner_id
      AND membership_cohort = 'private' AND email_verified = 1 AND coalesce(banned, 0) = 0)
    AND (SELECT COUNT(*) FROM organization
      WHERE creation_owner_id = NEW.creation_owner_id AND creation_kind IN ('shared', 'historical')) < 1)
)
BEGIN
  SELECT RAISE(ABORT, 'workspace_creation_quota');
END;
--> statement-breakpoint
-- Role transfers cannot release the original creator's slot. Account deletion
-- may null provenance through its foreign key without deleting retained content.
CREATE TRIGGER workspace_creation_owner_immutable
BEFORE UPDATE OF creation_owner_id, creation_kind ON organization
WHEN OLD.creation_kind <> NEW.creation_kind
  OR (OLD.creation_owner_id IS NOT NEW.creation_owner_id
    AND (NEW.creation_owner_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM user WHERE id = OLD.creation_owner_id)))
BEGIN
  SELECT RAISE(ABORT, 'workspace_creation_owner_immutable');
END;
