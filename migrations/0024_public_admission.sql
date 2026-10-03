-- Opaque public user identity is reserved before insertion; no private pending account is counted.
CREATE TABLE public_admission (
  email_hash TEXT PRIMARY KEY NOT NULL CHECK (length(email_hash) = 64),
  user_id TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
--> statement-breakpoint
-- Consumption and public activation are one SQLite statement, including rollback.
CREATE TRIGGER public_admission_activate
AFTER UPDATE OF consumed_at ON public_admission
WHEN OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
BEGIN
  UPDATE user SET membership_cohort = 'public'
  WHERE id = NEW.user_id AND membership_cohort = 'pending' AND coalesce(banned, 0) = 0;
END;
