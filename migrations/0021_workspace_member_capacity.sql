-- The auth plugin checks before it writes; this guard also serializes competing
-- accepts and direct grants in D1. Existing members are retained on downgrade.
ALTER TABLE workspace_plan ADD COLUMN retained_member_limit INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(retained_member_limit) = 'integer' AND retained_member_limit >= 1);
--> statement-breakpoint
UPDATE workspace_plan SET retained_member_limit = MAX(1,
  (SELECT COUNT(*) FROM member m WHERE m.organization_id = workspace_plan.organization_id));
--> statement-breakpoint
CREATE TRIGGER workspace_member_capacity_insert
BEFORE INSERT ON member
WHEN NOT EXISTS (
  SELECT 1 FROM workspace_plan p
  WHERE p.organization_id = NEW.organization_id
    AND typeof(p.base_member_limit) = 'integer'
    AND p.base_member_limit >= 1
    AND (SELECT COUNT(*) FROM member m WHERE m.organization_id = NEW.organization_id) <
      CASE
        WHEN p.paid_access_suspended = 0 AND p.paid_through > unixepoch('subsec') * 1000
          AND p.paid_plan = 'team' AND p.kind = 'shared'
          THEN MAX(3, p.base_member_limit, p.retained_member_limit)
        WHEN p.base_plan = 'free' THEN MAX(1, p.retained_member_limit)
        WHEN p.base_plan IN ('private', 'legacy') THEN MAX(3, p.base_member_limit, p.retained_member_limit)
        ELSE 0
      END
)
BEGIN
  SELECT RAISE(ABORT, 'workspace_member_quota');
END;
