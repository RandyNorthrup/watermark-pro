-- The shared catalog allows 20 Free, 1,000 Pro/private and 2,000 Team saved
-- presets. Only additional objects consume capacity: retained rows survive
-- expiry/downgrade, and existing read/edit/delete operations remain available.
-- This indexed count runs inside the same INSERT that admits a new preset.
CREATE TRIGGER watermark_plan_capacity_insert
BEFORE INSERT ON watermark
WHEN NOT EXISTS (
  SELECT 1 FROM workspace_plan p
  WHERE p.organization_id = NEW.organization_id
    AND (SELECT COUNT(*) FROM watermark WHERE organization_id = NEW.organization_id) <
      CASE
        WHEN p.paid_access_suspended = 0
          AND p.paid_through > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          THEN CASE p.paid_plan
            WHEN 'pro' THEN 1000
            WHEN 'team' THEN 2000
            ELSE CASE WHEN p.base_plan = 'free' THEN 20 ELSE 1000 END
          END
        WHEN p.base_plan = 'free' THEN 20
        WHEN p.base_plan IN ('private', 'legacy') THEN 1000
        ELSE NULL
      END
)
BEGIN SELECT RAISE(ABORT, 'workspace_preset_quota'); END;
--> statement-breakpoint
-- No application route moves a preset between tenants. Direct writes still
-- cannot evade the destination limit by inserting elsewhere then moving it.
CREATE TRIGGER watermark_plan_capacity_move
BEFORE UPDATE OF organization_id ON watermark
WHEN NEW.organization_id <> OLD.organization_id AND NOT EXISTS (
  SELECT 1 FROM workspace_plan p
  WHERE p.organization_id = NEW.organization_id
    AND (SELECT COUNT(*) FROM watermark WHERE organization_id = NEW.organization_id) <
      CASE
        WHEN p.paid_access_suspended = 0
          AND p.paid_through > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
          THEN CASE p.paid_plan
            WHEN 'pro' THEN 1000
            WHEN 'team' THEN 2000
            ELSE CASE WHEN p.base_plan = 'free' THEN 20 ELSE 1000 END
          END
        WHEN p.base_plan = 'free' THEN 20
        WHEN p.base_plan IN ('private', 'legacy') THEN 1000
        ELSE NULL
      END
)
BEGIN SELECT RAISE(ABORT, 'workspace_preset_quota'); END;
