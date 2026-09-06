/**
 * Workers test setup: applies the D1 migrations to the per-test-file
 * database before any test runs. The migration list is injected as a
 * binding by vitest.workers.config.ts (read from ./migrations under Node).
 */
import { applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// TEST_MIGRATIONS exists only in the test binding set, so it is deliberately
// absent from the generated Env type; this is the single place it is read.
const testEnv = env as unknown as { TEST_MIGRATIONS: D1Migration[] }

await applyD1Migrations(env.DB, testEnv.TEST_MIGRATIONS)
