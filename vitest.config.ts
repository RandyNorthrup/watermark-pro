import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
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
      './vitest.workers.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // Bootstraps the DOM; exercised by the Playwright smoke test instead.
        'src/client/main.tsx',
        'src/client/routeTree.gen.ts',
        'src/client/test-setup.ts',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
})
