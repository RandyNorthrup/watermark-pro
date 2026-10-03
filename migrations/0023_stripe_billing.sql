-- Provider authority is reserved before Checkout. A new paid workspace does
-- not exist until a verified current subscription and invoice are reconciled.
CREATE TABLE billing_workspace (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT UNIQUE REFERENCES organization(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  account_id TEXT NOT NULL,
  live_mode INTEGER NOT NULL CHECK (live_mode IN (0, 1)),
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'team')),
  request_id TEXT NOT NULL UNIQUE,
  new_workspace_name TEXT,
  customer_id TEXT UNIQUE,
  checkout_session_id TEXT UNIQUE,
  checkout_expires_at INTEGER NOT NULL,
  checkout_state TEXT NOT NULL DEFAULT 'none' CHECK (checkout_state IN ('none', 'open', 'complete', 'expired')),
  chargeable INTEGER NOT NULL DEFAULT 1 CHECK (chargeable IN (0, 1)),
  subscription_id TEXT UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'none',
  paid_through INTEGER,
  suspended INTEGER NOT NULL DEFAULT 1 CHECK (suspended IN (0, 1)),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  invoice_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lease_token TEXT,
  lease_until INTEGER,
  CHECK (new_workspace_name IS NULL OR plan = 'team')
);
--> statement-breakpoint
CREATE UNIQUE INDEX billing_one_team_per_payer ON billing_workspace(owner_id)
WHERE plan = 'team' AND owner_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE billing_event (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  live_mode INTEGER NOT NULL CHECK (live_mode IN (0, 1)),
  event_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  authority_id TEXT REFERENCES billing_workspace(id),
  subscription_id TEXT,
  invoice_id TEXT,
  provider_created INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  completed_at INTEGER,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('reconciled', 'ignored'))
);
--> statement-breakpoint
-- 0022 refuses paid creation until this authoritative payment seam exists.
DROP TRIGGER workspace_creation_capacity_insert;
--> statement-breakpoint
CREATE TRIGGER workspace_creation_capacity_insert
BEFORE INSERT ON organization
WHEN NOT (
  (NEW.creation_kind = 'personal'
    AND EXISTS (SELECT 1 FROM user WHERE id = NEW.creation_owner_id)
    AND NEW.id = 'personal-' || NEW.creation_owner_id AND NEW.slug = NEW.id)
  OR (NEW.creation_kind = 'shared'
    AND EXISTS (SELECT 1 FROM user WHERE id = NEW.creation_owner_id
      AND membership_cohort = 'private' AND email_verified = 1 AND COALESCE(banned, 0) = 0)
    AND (SELECT COUNT(*) FROM organization WHERE creation_owner_id = NEW.creation_owner_id
      AND creation_kind IN ('shared', 'historical')) < 1)
  OR (NEW.creation_kind = 'paid' AND EXISTS (
    SELECT 1 FROM billing_workspace b JOIN user u ON u.id = b.owner_id
    WHERE b.id = NEW.id AND b.owner_id = NEW.creation_owner_id AND b.plan = 'team'
      AND b.new_workspace_name = NEW.name AND b.organization_id IS NULL
      AND b.subscription_id IS NOT NULL AND b.subscription_status = 'active'
      AND b.invoice_id IS NOT NULL AND b.suspended = 0
      AND b.paid_through > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
      AND b.lease_token IS NOT NULL
      AND b.lease_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
      AND u.email_verified = 1 AND COALESCE(u.banned, 0) = 0
      AND u.membership_cohort IN ('private', 'public')
  ))
)
BEGIN SELECT RAISE(ABORT, 'workspace_creation_quota'); END;
--> statement-breakpoint
-- Paid provenance persists after cancellation: a private buyer cannot turn a
-- cancelled Team subscription into a separate free/private shared allowance.
DROP TRIGGER workspace_plan_on_private_owner;
--> statement-breakpoint
CREATE TRIGGER workspace_plan_on_private_owner
AFTER INSERT ON member
WHEN NEW.role = 'owner'
  AND EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id AND membership_cohort = 'private')
  AND EXISTS (SELECT 1 FROM organization WHERE id = NEW.organization_id AND creation_kind <> 'paid')
BEGIN
  UPDATE workspace_plan SET base_plan = 'private', base_member_limit = 3
  WHERE organization_id = NEW.organization_id AND kind = 'shared' AND base_plan = 'free';
END;
--> statement-breakpoint
-- Keep a current authenticated owner able to cancel every charge. These
-- fences also cover compatibility auth APIs and direct/cascading mutations.
CREATE TRIGGER billing_payer_member_delete
BEFORE DELETE ON member
WHEN OLD.role = 'owner' AND EXISTS (SELECT 1 FROM billing_workspace
  WHERE organization_id = OLD.organization_id AND owner_id = OLD.user_id
    AND (chargeable = 1 OR (lease_token IS NOT NULL AND lease_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))
BEGIN SELECT RAISE(ABORT, 'billing_cancel_before_owner_removal'); END;
--> statement-breakpoint
CREATE TRIGGER billing_payer_member_update
BEFORE UPDATE OF role, user_id, organization_id ON member
WHEN OLD.role = 'owner'
  AND (NEW.role <> 'owner' OR NEW.user_id <> OLD.user_id OR NEW.organization_id <> OLD.organization_id)
  AND EXISTS (SELECT 1 FROM billing_workspace
    WHERE organization_id = OLD.organization_id AND owner_id = OLD.user_id
      AND (chargeable = 1 OR (lease_token IS NOT NULL AND lease_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))
BEGIN SELECT RAISE(ABORT, 'billing_cancel_before_owner_removal'); END;
--> statement-breakpoint
-- Better Auth removes credentials before its final user DELETE. Once closure
-- proves no charge, a later read/webhook lease must not strand that deletion.
-- Financial acquire/commit CAS requires the owner row, preventing resurrection.
CREATE TRIGGER billing_payer_user_delete
BEFORE DELETE ON user
WHEN EXISTS (SELECT 1 FROM billing_workspace WHERE owner_id = OLD.id
  AND chargeable = 1)
BEGIN SELECT RAISE(ABORT, 'billing_cancel_before_account_deletion'); END;
--> statement-breakpoint
CREATE TRIGGER billing_workspace_delete
BEFORE DELETE ON organization
WHEN EXISTS (SELECT 1 FROM billing_workspace WHERE organization_id = OLD.id
  AND (chargeable = 1 OR (lease_token IS NOT NULL AND lease_until > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))
BEGIN SELECT RAISE(ABORT, 'billing_cancel_before_workspace_deletion'); END;
--> statement-breakpoint
-- A security ban suspends paid writes immediately, even when Stripe is unavailable.
-- The existing banned + chargeable rows remain the scheduled provider-closure signal.
CREATE TRIGGER billing_suspend_on_ban
AFTER UPDATE OF banned ON user
WHEN NEW.banned = 1
BEGIN
  UPDATE billing_workspace SET suspended = 1, paid_through = NULL WHERE owner_id = NEW.id;
  UPDATE workspace_plan SET paid_access_suspended = 1, paid_through = NULL, revision = revision + 1
  WHERE organization_id IN (SELECT organization_id FROM billing_workspace WHERE owner_id = NEW.id);
END;
