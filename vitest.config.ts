import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const PAGE_TEST_TIMEOUT_MS = 20_000

/** Coverage floors. Lowering one needs a PLAN.md §9 entry. */
const COVERAGE_THRESHOLDS = {
  lines: 90,
  statements: 90,
  functions: 90,
  branches: 85,
} as const

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          tanstackRouter({
            target: 'react',
            routesDirectory: './src/client/routes',
            generatedRouteTree: './src/client/routeTree.gen.ts',
            routeFileIgnorePattern: String.raw`\.test\.tsx?$`,
          }),
          react(),
        ],
        test: {
          name: 'unit-client',
          environment: 'jsdom',
          include: ['src/client/**/*.test.{ts,tsx}', 'src/shared/**/*.test.ts'],
          exclude: ['src/client/**/*.browser.test.ts'],
          setupFiles: ['./src/client/test-setup.ts'],
          // Router-level page tests: many awaited steps each, under coverage,
          // on a machine that may be busy. Failures still surface; slow steps
          // are not mistaken for broken ones.
          testTimeout: PAGE_TEST_TIMEOUT_MS,
        },
      },
      {
        test: {
          name: 'unit-worker',
          environment: 'node',
          include: ['src/worker/**/*.test.ts'],
          exclude: ['src/worker/**/*.workers.test.ts'],
        },
      },
      {
        // Canvas rendering, encoding and the Web Worker run in a real
        // Chromium; jsdom has no 2D context worth testing against.
        test: {
          name: 'browser',
          include: ['src/client/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      './vitest.workers.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/test-support/**',
        'src/client/test-setup.ts',
        // Bootstraps the DOM; exercised by the Playwright smoke test instead.
        'src/client/main.tsx',
        'src/client/routeTree.gen.ts',
        // Instantiates the Better Auth browser client; page tests replace the
        // module with a fake, so its one statement runs only in Playwright.
        'src/client/lib/auth-client.ts',
        // One-line side-effect import of main.tsx; covered by Playwright.
        'src/client/lib/zod-config.ts',
        // Runs inside a Web Worker thread, which coverage cannot instrument;
        // exercised end to end through worker-client tests in Chromium.
        'src/client/engine/worker.ts',
        // Pure canvas drawing: every branch is a 2D-context call that jsdom
        // cannot run (getContext is null there). Exercised by the `browser`
        // project (pipeline/text-layout browser tests), which cannot report
        // coverage. See PLAN.md §9.
        'src/client/engine/render.ts',
        // Decodes an image file to pixels on a canvas to read an invisible
        // mark; getContext is null in jsdom, so the Verify page test replaces
        // this module with a fake. See PLAN.md §9.
        'src/client/lib/read-invisible.ts',
        // The logo-prepare panel decodes/encodes on a 2D canvas (createImageBitmap
        // and getImageData, both absent in jsdom); its pure decisions live in the
        // fully tested lib/logo-prepare-pipeline.ts. See PLAN.md §9.
        'src/client/components/designer/logo-prepare.tsx',
        // Cloud import pickers (M16): each loads a third-party SDK (Google
        // Picker + GIS, the Dropbox Chooser drop-in) or the bundled MSAL client
        // and drives a vendor popup/iframe that cannot run in jsdom. Their pure
        // decisions (download-URL builders, response->item mappers, extension
        // derivation) live in tested helpers within the same modules and in
        // lib/imports/download.ts + lib/imports/source.ts. The OneDrive browse
        // dialog is likewise vendor-token/Graph glue. See PLAN.md §9.
        'src/client/lib/imports/google-picker.ts',
        'src/client/lib/imports/google-drive-save.ts',
        'src/client/lib/imports/dropbox-chooser.ts',
        'src/client/lib/imports/dropbox-save.ts',
        'src/client/lib/imports/onedrive.ts',
        'src/client/components/import/onedrive-dialog.tsx',
        // D1 and binding wiring that only executes inside workerd. Covered
        // functionally by the `workers` project, which cannot report coverage.
        'src/worker/db/**',
        'src/worker/services.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
})
