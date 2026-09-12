import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import { bundleInventoryPlugin } from './scripts/lib/bundle-inventory'
import { routePreloadPlugin } from './scripts/lib/route-preloads'
import { completeSoftwareNotices } from './scripts/lib/software-notices'

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

/** Each build gets a complete offline asset inventory and a changed service-worker version. */
function offlineAssetsPlugin(): Plugin {
  return {
    name: 'offline-assets',
    apply: 'build',
    writeBundle(options, bundle) {
      if (bundle['index.html']?.type !== 'asset') {
        return
      }
      const outDir = options.dir ?? path.join('dist', 'client')
      completeSoftwareNotices(outDir)
      const assets = [
        '/offline-shell',
        '/sample-scene.jpg',
        '/manifest.webmanifest',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/icon-192.png',
        '/icon-512.png',
        '/icon-maskable-512.png',
        '/third-party-licenses.md',
        '/open-source.md',
        ...['fonts', 'stickers', 'product', 'photography']
          .flatMap((directory) =>
            existsSync(path.join('public', directory))
              ? readdirSync(path.join('public', directory), {
                  recursive: true,
                  withFileTypes: true,
                })
              : [],
          )
          .filter((entry) => entry.isFile())
          .map(
            (entry) =>
              `/${path.relative('public', path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')}`,
          ),
        ...Object.keys(bundle)
          .filter((name) => name.startsWith('assets/'))
          .map((name) => `/${name}`),
      ].toSorted((first, second) => first.localeCompare(second))
      const html = bundle['index.html']
      const source =
        typeof html.source === 'string' ? html.source : Buffer.from(html.source).toString('utf8')
      const worker = readFileSync(path.join('public', 'sw.js'), 'utf8')
      const hash = createHash('sha256').update(JSON.stringify(assets)).update(source).update(worker)
      // Unhashed public assets can change without changing their URL. Cache
      // identity must include their bytes as well as Vite's hashed chunk names.
      for (const asset of assets) {
        if (asset === '/offline-shell') {
          continue
        }
        const assetPath = path.join(outDir, asset.slice(1))
        hash.update(readFileSync(assetPath))
      }
      const digest = hash.digest('hex')
      const document = source.replace(
        '<head>',
        () => `<head><meta name="offline-build" content="watermark-pro-offline-${digest}">`,
      )
      writeFileSync(path.join(outDir, 'index.html'), document)
      writeFileSync(path.join(outDir, 'offline-shell.html'), document)
      writeFileSync(path.join(outDir, 'offline-manifest.json'), JSON.stringify(assets))
      writeFileSync(
        path.join(outDir, 'sw.js'),
        worker.replace('watermark-pro-offline-v2', () => `watermark-pro-offline-${digest}`),
      )
    },
  }
}

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

/** Libraries split at their actual feature boundaries; eager grouping would load unused tools at boot. */
export default defineConfig({
  build: {
    // The client build emits `.vite/manifest.json` so the bundle report and the
    // size-budget gate (scripts/bundle-report.mjs, scripts/bundle-budget.mjs)
    // can trace the initial-load set per route from the real chunk graph
    // instead of scraping the built HTML. The Worker build ignores this.
    manifest: true,
    license: { fileName: 'third-party-licenses.md' },
    rolldownOptions: {
      output: {
        postBanner: '/*! /third-party-licenses.md /open-source.md */',
      },
      treeshake: {
        // This module only constructs validators. The router leaves side-effect
        // imports after splitting forms; they must not load unused form schemas
        // into every route. Used validators remain in their actual form chunks.
        moduleSideEffects: (id) => !id.replaceAll('\\', '/').endsWith('/src/shared/validation.ts'),
      },
    },
  },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          preserveEntrySignatures: 'allow-extension',
          output: {
            // Zod barrels and split form declarations expose pre-treeshake
            // imports to $initial. Preserve their existing chunk boundaries.
            strictExecutionOrder: true,
            codeSplitting: {
              groups: [
                {
                  name: 'app-boot',
                  tags: ['$initial'],
                  includeDependenciesRecursively: false,
                  test: (id) => {
                    const normalized = id.replaceAll('\\', '/')
                    return (
                      !normalized.includes('/node_modules/zod/') &&
                      !normalized.endsWith('/src/shared/validation.ts')
                    )
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
  plugins: [
    // Must run before the React plugin so route files are transformed first.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      codeSplittingOptions: {
        defaultBehavior: [
          ['loader'],
          ['component'],
          ['pendingComponent'],
          ['errorComponent'],
          ['notFoundComponent'],
        ],
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
    // After the client build writes index.html and _headers, allow-list the
    // inline theme script's hash in the CSP.
    routePreloadPlugin(),
    inlineScriptCspHashPlugin(),
    offlineAssetsPlugin(),
    bundleInventoryPlugin(),
  ],
})
