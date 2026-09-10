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
        optimizeDeps: { include: ['zod/mini'] },
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
      // Runtime TypeScript/TSX is executable coverage. JSON catalogues and CSS
      // are data/assets, verified by catalogue tests and rendered UI checks;
      // treating Vite's raw JSON ?import URL as JavaScript cannot be parsed.
      include: ['src/**/*.{ts,tsx}'],
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
        // Dedicated Web Worker entries remain outside the page's V8 profiler.
        // Main-thread canvas, provider, media and locale modules are included;
        // the M19 counter audit disproved their earlier blanket exclusions.
        // Both worker entries have real browser message/output tests instead.
        'src/client/engine/worker.ts',
        'src/client/video/worker.ts',
        // D1 and binding wiring that only executes inside workerd. Covered
        // functionally by the `workers` project, which cannot report coverage.
        'src/worker/db/**',
        'src/worker/services.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
})
