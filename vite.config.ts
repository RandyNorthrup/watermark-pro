import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * index.html carries one inline `<script>` (the pre-paint theme resolver) so
 * the static skeleton never flashes the wrong theme. The SPA's CSP lives in
 * public/_headers with a strict `script-src` that has no `'unsafe-inline'`, so
 * that script needs its sha256 hash allow-listed. This plugin reads the built
 * HTML, hashes every inline script it actually emitted, and writes the hashes
 * into the `script-src` of the emitted `dist/client/_headers` — computed from
 * the final bytes, so it can never drift from what the browser executes.
 */
const SCRIPT_SRC_MARKER = "script-src 'self'"
const INLINE_SCRIPT_PATTERN = /<script(?![^>]*\ssrc=)[^>]*>([\S\s]*?)<\/script>/g

function inlineScriptCspHashPlugin(): Plugin {
  return {
    name: 'inline-script-csp-hash',
    apply: 'build',
    writeBundle(options, bundle) {
      const html = bundle['index.html']
      // Only the client build emits index.html; the Worker build has no HTML.
      if (html?.type !== 'asset') {
        return
      }
      const source =
        typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8')
      const hashes: string[] = []
      for (const match of source.matchAll(INLINE_SCRIPT_PATTERN)) {
        const content = match[1] ?? ''
        const digest = createHash('sha256').update(content, 'utf8').digest('base64')
        hashes.push(`'sha256-${digest}'`)
      }
      if (hashes.length === 0) {
        return
      }
      const outDir = options.dir ?? path.join('dist', 'client')
      const headersPath = path.join(outDir, '_headers')
      if (!existsSync(headersPath)) {
        throw new Error(
          `inline-script-csp-hash: ${headersPath} not found; cannot secure the inline script`,
        )
      }
      const headers = readFileSync(headersPath, 'utf8')
      if (!headers.includes(SCRIPT_SRC_MARKER)) {
        throw new Error(`inline-script-csp-hash: "${SCRIPT_SRC_MARKER}" not found in _headers`)
      }
      // A function replacement keeps `$` sequences in the hashes literal.
      writeFileSync(
        headersPath,
        headers.replace(SCRIPT_SRC_MARKER, () => `${SCRIPT_SRC_MARKER} ${hashes.join(' ')}`),
      )
    },
  }
}

/**
 * mediabunny (video, M17) and pdf-lib (documents, M17) are large and each is
 * reached only from its own route, so they ride in their own long-cached chunk
 * instead of weighing down any page that does not watermark that media type.
 *
 * The UI primitives (radix-ui, lucide-react) are deliberately NOT grouped
 * (M19): grouping every primitive into one `ui` chunk pulled all of radix onto
 * the first paint even though the shell needs only a handful, costing ~40 kB
 * gzip. Cloudflare serves HTTP/2, so the many-small-files round-trip cost the
 * grouping avoided no longer applies; letting rolldown split them per route
 * keeps the public boot lean (PLAN.md §5.5).
 */
const VIDEO_CHUNK_GROUP = {
  name: 'video',
  test: /node_modules[\\/]mediabunny[\\/]/,
}
const PDF_CHUNK_GROUP = {
  name: 'pdf',
  test: /node_modules[\\/]pdf-lib[\\/]/,
}

export default defineConfig({
  build: {
    // The client build emits `.vite/manifest.json` so the bundle report and the
    // size-budget gate (scripts/bundle-report.mjs, scripts/bundle-budget.mjs)
    // can trace the initial-load set per route from the real chunk graph
    // instead of scraping the built HTML. The Worker build ignores this.
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [VIDEO_CHUNK_GROUP, PDF_CHUNK_GROUP] },
      },
    },
  },
  plugins: [
    // Must run before the React plugin so route files are transformed first.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
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
    // After the client build writes index.html and _headers, allow-list the
    // inline theme script's hash in the CSP.
    inlineScriptCspHashPlugin(),
  ],
})
