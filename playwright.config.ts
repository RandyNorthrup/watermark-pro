import { defineConfig, devices } from '@playwright/test'

/**
 * Must match APP_URL in wrangler.jsonc: the Worker only accepts state-changing
 * requests from that origin, so the preview has to be served from it.
 */
const PREVIEW_PORT = 5173
const BASE_URL = `http://localhost:${String(PREVIEW_PORT)}`
const CI_RETRIES = 2
const SERVER_START_TIMEOUT_MS = 180_000

/**
 * End-to-end tests run against the production build served by `vite preview`,
 * which executes the Worker in workerd exactly as production does.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : CI_RETRIES,
  reporter: process.env['CI'] === undefined ? 'list' : 'github',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // The share flows write links to the clipboard; headless Chromium denies that unless granted.
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run db:migrate:local && npm run preview',
    url: BASE_URL,
    // Always build fresh: a running dev server on this port would serve
    // unbuilt code and the test would no longer be about the production build.
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
  },
})
