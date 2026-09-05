import { defineConfig, devices } from '@playwright/test'

const PREVIEW_PORT = 4173
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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: SERVER_START_TIMEOUT_MS,
  },
})
