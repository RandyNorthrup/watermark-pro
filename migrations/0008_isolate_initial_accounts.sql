-- Reserved migration marker. Existing workspace data is never selected using
-- deployment-specific identifiers in public source. An operator can run
-- scripts/split-empty-workspace.mjs with privately supplied identifiers after
-- backup and verified empty-state preconditions. Its D1 migration is atomic.
SELECT 1;
