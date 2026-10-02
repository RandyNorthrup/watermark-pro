ALTER TABLE `site_invitation` ADD `grant_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `site_invitation_grant_idx` ON `site_invitation` (`inviter_id`,`grant_version`,`accepted_at`,`revoked_at`,`expires_at`);--> statement-breakpoint
ALTER TABLE `user` ADD `membership_cohort` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
-- Historical accounts retain their private access, site roles and workspace grants.
UPDATE user SET membership_cohort = 'private';
--> statement-breakpoint
-- Historical accepted admissions never consume the new grant. Keep at most
-- two live pending promises per inviter, in stable oldest-first order; revoke
-- excess promises rather than allowing the migration to over-reserve capacity.
UPDATE site_invitation SET grant_version = 0;
--> statement-breakpoint
UPDATE site_invitation SET grant_version = 1 WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY inviter_id ORDER BY created_at, id) AS position
    FROM site_invitation
    WHERE accepted_at IS NULL AND revoked_at IS NULL
      AND expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000
  ) WHERE position <= 2
);
--> statement-breakpoint
UPDATE site_invitation SET revoked_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE grant_version = 0 AND accepted_at IS NULL AND revoked_at IS NULL
  AND expires_at > CAST(strftime('%s', 'now') AS INTEGER) * 1000;
