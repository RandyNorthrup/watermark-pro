-- Better Auth 1.7.3 reverted the 1.7.0-1.7.2 account issuer schema and keys accounts
-- by (provider_id, account_id) again; it refuses a schema whose required columns it
-- never writes. Drop the issuer index before the column, per the upstream 1.7 upgrade
-- guide, and keep the restored key unique. No backfill is needed.
DROP INDEX `account_issuer_account_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_id_account_id_unique` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;