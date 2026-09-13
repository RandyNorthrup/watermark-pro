-- Sender-wide workspace email budgets use immutable audit entries. No foreign
-- key ties these entries to workspaces or invitation rows, so deleting either
-- cannot erase a consumed send allowance.
CREATE INDEX `audit_log_actor_action_created_at_idx` ON `audit_log` (`actor_user_id`, `action`, `created_at`);
