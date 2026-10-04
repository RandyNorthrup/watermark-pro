CREATE TABLE workspace_plan (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  base_plan TEXT NOT NULL CHECK (base_plan IN ('free', 'private', 'legacy')),
  base_member_limit INTEGER NOT NULL CHECK (base_member_limit >= 1),
  paid_plan TEXT CHECK (paid_plan IN ('pro', 'team')),
  paid_through INTEGER,
  paid_access_suspended INTEGER NOT NULL DEFAULT 0 CHECK (paid_access_suspended IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  CHECK (kind <> 'personal' OR base_member_limit = 1),
  CHECK (paid_plan IS NULL OR (paid_plan = 'pro' AND kind = 'personal') OR (paid_plan = 'team' AND kind = 'shared'))
);
--> statement-breakpoint
-- Historical shared grants retain existing membership and storage. Private
-- personal grants remain independent of future subscriptions; public accounts
-- never inherit them merely by owning a workspace.
INSERT INTO workspace_plan (organization_id, kind, base_plan, base_member_limit)
SELECT o.id,
  CASE WHEN pw.organization_id IS NULL THEN 'shared' ELSE 'personal' END,
  CASE WHEN pw.organization_id IS NULL THEN 'legacy'
       WHEN u.membership_cohort = 'private' THEN 'private' ELSE 'free' END,
  CASE WHEN pw.organization_id IS NOT NULL THEN 1
       ELSE MAX(3, (SELECT COUNT(*) FROM member m WHERE m.organization_id = o.id)) END
FROM organization o
LEFT JOIN private_workspace pw ON pw.organization_id = o.id
LEFT JOIN user u ON u.id = pw.user_id;
--> statement-breakpoint
-- Every future organization gets an explicit server record before quota checks.
-- Neither organization metadata nor a client plan name participates.
CREATE TRIGGER workspace_plan_on_organization
AFTER INSERT ON organization
BEGIN
  INSERT INTO workspace_plan (organization_id, kind, base_plan, base_member_limit)
  VALUES (NEW.id, 'shared', 'free', 1);
END;
--> statement-breakpoint
CREATE TRIGGER workspace_plan_on_private_owner
AFTER INSERT ON member
WHEN NEW.role = 'owner'
  AND EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id AND membership_cohort = 'private')
BEGIN
  UPDATE workspace_plan SET base_plan = 'private', base_member_limit = 3
  WHERE organization_id = NEW.organization_id AND kind = 'shared' AND base_plan = 'free';
END;
--> statement-breakpoint
CREATE TRIGGER workspace_plan_on_personal_workspace
AFTER INSERT ON private_workspace
BEGIN
  UPDATE workspace_plan SET kind = 'personal', base_member_limit = 1,
    base_plan = CASE WHEN EXISTS (
      SELECT 1 FROM user WHERE id = NEW.user_id AND membership_cohort = 'private'
    ) THEN 'private' ELSE 'free' END
  WHERE organization_id = NEW.organization_id;
END;
