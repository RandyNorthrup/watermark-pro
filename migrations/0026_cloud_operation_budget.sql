-- Monthly product quota is local; the dedicated singleton survives workspace/account replacement.
ALTER TABLE workspace_plan ADD COLUMN operation_month INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(operation_month) = 'integer' AND operation_month >= 0);
--> statement-breakpoint
ALTER TABLE workspace_plan ADD COLUMN operation_units INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(operation_units) = 'integer' AND operation_units >= 0);
--> statement-breakpoint
CREATE TABLE cloud_operation_site_budget (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  month INTEGER NOT NULL DEFAULT 0 CHECK (typeof(month) = 'integer' AND month >= 0),
  units INTEGER NOT NULL DEFAULT 0 CHECK (typeof(units) = 'integer' AND units >= 0)
);
--> statement-breakpoint
INSERT INTO cloud_operation_site_budget (id, month, units) VALUES (1, 0, 0);
--> statement-breakpoint
-- REPLACE may bypass DELETE triggers when recursive_triggers is disabled.
CREATE TRIGGER cloud_operation_site_no_replace BEFORE INSERT ON cloud_operation_site_budget
WHEN EXISTS (SELECT 1 FROM cloud_operation_site_budget WHERE id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'cloud_operation_authority_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER cloud_operation_site_no_delete BEFORE DELETE ON cloud_operation_site_budget
BEGIN SELECT RAISE(ABORT, 'cloud_operation_authority_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER cloud_operation_site_monotonic BEFORE UPDATE ON cloud_operation_site_budget
WHEN NEW.id <> OLD.id OR NEW.month < OLD.month
  OR (NEW.month = OLD.month AND NEW.units < OLD.units)
BEGIN SELECT RAISE(ABORT, 'cloud_operation_authority_invalid'); END;
--> statement-breakpoint
-- RAISE(ABORT) undoes both the tentative workspace spend and the trigger's site debit.
-- 3000000 mirrors typed operator policy; the actual migration test checks agreement.
CREATE TRIGGER workspace_operation_site_debit
AFTER UPDATE OF operation_month, operation_units ON workspace_plan
BEGIN
  SELECT CASE WHEN NEW.operation_month <> CAST(strftime('%Y', 'now') AS INTEGER) * 12 + CAST(strftime('%m', 'now') AS INTEGER) - 1
    OR NEW.operation_month < OLD.operation_month
    OR NEW.operation_units <= CASE WHEN NEW.operation_month = OLD.operation_month THEN OLD.operation_units ELSE 0 END
    THEN RAISE(ABORT, 'cloud_operation_authority_invalid') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_operation_site_budget WHERE id = 1 AND month <= NEW.operation_month)
    THEN RAISE(ABORT, 'cloud_operation_authority_invalid') END;
  UPDATE cloud_operation_site_budget
    SET month = NEW.operation_month,
      units = CASE WHEN month < NEW.operation_month THEN 0 ELSE units END
        + NEW.operation_units - CASE WHEN NEW.operation_month = OLD.operation_month THEN OLD.operation_units ELSE 0 END
    WHERE id = 1 AND month <= NEW.operation_month
      AND CASE WHEN month < NEW.operation_month THEN 0 ELSE units END
        + NEW.operation_units - CASE WHEN NEW.operation_month = OLD.operation_month THEN OLD.operation_units ELSE 0 END <= 3000000;
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'cloud_operation_site_exhausted') END;
END;
