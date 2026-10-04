import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/** WebKit's platform AAC path differs from Chromium; verify it in the actual Linux runner too. */
export default defineConfig({
  test: {
    include: ['src/client/video/aac-*.browser.test.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'webkit' }],
    },
  },
})
