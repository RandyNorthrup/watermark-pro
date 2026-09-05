import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

/**
 * Integration tests that run inside workerd with the bindings declared in
 * wrangler.jsonc. Coverage is not collected here: the Workers pool cannot
 * instrument code, so worker modules earn their coverage from the Node-based
 * `unit-worker` project and this project verifies runtime wiring only.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { APP_ENV: 'test' },
      },
    }),
  ],
  test: {
    name: 'workers',
    include: ['src/worker/**/*.workers.test.ts'],
  },
})
