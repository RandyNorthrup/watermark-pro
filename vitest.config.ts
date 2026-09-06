import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

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
        // D1 and binding wiring that only executes inside workerd. Covered
        // functionally by the `workers` project, which cannot report coverage.
        'src/worker/db/**',
        'src/worker/services.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
})
