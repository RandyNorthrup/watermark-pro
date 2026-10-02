-- Existing sessions remain usable for ordinary work, but carry no credential proof.
-- Creation/renewal/email verification must not manufacture a fresh sign-in.
ALTER TABLE session ADD COLUMN credential_verified_at INTEGER;
