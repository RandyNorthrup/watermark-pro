import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

/**
 * Integration tests that run inside workerd with the bindings declared in
 * wrangler.jsonc: real D1 (migrated per test file), real rate-limit bindings,
 * real Better Auth over drizzle. Coverage is not collected here: the Workers
 * pool cannot instrument code, so worker modules earn their coverage from the
 * Node-based `unit-worker` project and this project verifies runtime wiring.
 */
const migrations = await readD1Migrations('./migrations')

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          APP_ENV: 'test',
          BETTER_AUTH_SECRET: 'workers-test-secret-with-at-least-32-chars',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    name: 'workers',
    include: ['src/worker/**/*.workers.test.ts'],
    setupFiles: ['./src/worker/test-support/apply-migrations.ts'],
  },
})
