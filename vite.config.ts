import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Chunking for phones on slow networks (PLAN.md §5.5 mobile budget). The UI
 * primitives and every icon in use are one long-cached chunk instead of
 * thirty 1 kB files, each costing a round trip on HTTP/1.1; React, the
 * router and the query client stay in the entry chunk they already share.
 */
const UI_CHUNK_GROUP = {
  name: 'ui',
  test: /node_modules[\\/](lucide-react|radix-ui|@radix-ui|class-variance-authority|clsx|tailwind-merge)[\\/]/,
}

export default defineConfig({
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [UI_CHUNK_GROUP] } },
    },
  },
  plugins: [
    // Must run before the React plugin so route files are transformed first.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      codeSplittingOptions: {
        // The authenticated layout (shell, navigation) is needed by every
        // signed-in page; keeping it in the entry saves a round trip.
        splitBehavior: ({ routeId }) => (routeId === '/app' ? [] : undefined),
      },
      routesDirectory: './src/client/routes',
      generatedRouteTree: './src/client/routeTree.gen.ts',
      // Co-located tests live beside routes but are not routes.
      routeFileIgnorePattern: String.raw`\.test\.tsx?$`,
    }),
    react(),
    tailwindcss(),
    // Runs src/worker in workerd during `vite dev` / `vite preview` and emits
    // the deployable Worker + assets bundle on `vite build`.
    cloudflare(),
  ],
})
