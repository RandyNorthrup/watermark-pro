import { defineConfig, devices } from '@playwright/test'

import { PREVIEW_ORIGIN } from './e2e/preview'

const BASE_URL = PREVIEW_ORIGIN
const CI_RETRIES = 2
const SERVER_START_TIMEOUT_MS = 240_000
/**
 * Every device project runs. Two simultaneous browsers keep complete 37 MiB
 * offline installs from contending with foreground WebKit journeys. The paired
 * offline proof passes existing deadlines at this concurrency; four cold
 * installs exceeded them. Longer journeys explicitly use `test.slow()`.
 */
const TEST_TIMEOUT_MS = 60_000
const EXPECT_TIMEOUT_MS = 10_000
const MAX_WORKERS = 2

/**
 * The share flows write links to the clipboard; headless Chromium denies that
 * unless granted. WebKit has no such permission and rejects the option.
 */
const CHROMIUM_PERMISSIONS = ['clipboard-read', 'clipboard-write']

/**
 * End-to-end tests run against the production build in the supported isolated
 * Workers SDK gate with native service/asset routing. Every
 * journey runs on four devices: a desktop, an iPhone and an iPad in WebKit
 * (the engine Safari uses), and an Android phone in Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: EXPECT_TIMEOUT_MS },
  workers: MAX_WORKERS,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : CI_RETRIES,
  reporter: process.env['CI'] === undefined ? 'list' : 'github',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], permissions: CHROMIUM_PERMISSIONS },
    },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'ipad', use: { ...devices['iPad Mini'] } },
    {
      name: 'android',
      use: { ...devices['Pixel 7'], permissions: CHROMIUM_PERMISSIONS },
    },
  ],
  webServer: {
    command: 'node scripts/gate-server.mjs',
    url: BASE_URL,
    // Always build fresh: a running dev server on this port would serve
    // unbuilt code and the test would no longer be about the production build.
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
  },
})
