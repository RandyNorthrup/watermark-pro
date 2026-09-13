/** Serve PDF.js decoder/font assets locally, with the same allowlist in development and releases. */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { Plugin } from 'vite'

const ASSET_ROOT = 'assets/pdfjs'
const ASSET_DIRECTORIES = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
const MIME_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
}

/** Include upstream notices beside every bundled decoder and font; no runtime CDN dependency. */
export function pdfjsAssetsPlugin(): Plugin {
  const files = new Map<string, string>()
  const packageRoot = path.resolve('node_modules/pdfjs-dist')
  const metadata: unknown = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !('version' in metadata) ||
    typeof metadata.version !== 'string'
  )
    throw new Error('PDF.js package version is missing.')
  const assetRoot = `${ASSET_ROOT}/${metadata.version}`
  files.set(`${assetRoot}/pdf.worker.min.mjs`, path.join(packageRoot, 'build/pdf.worker.min.mjs'))
  files.set(`${assetRoot}/LICENSE`, path.join(packageRoot, 'LICENSE'))
  for (const directory of ASSET_DIRECTORIES) {
    const entries = readdirSync(path.join(packageRoot, directory), { withFileTypes: true })
    for (const file of entries) {
      if (file.isFile())
        files.set(
          `${assetRoot}/${directory}/${file.name}`,
          path.join(packageRoot, directory, file.name),
        )
    }
  }
  return {
    name: 'pdfjs-local-assets',
    applyToEnvironment: (environment) => environment.name === 'client',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? '').split('?', 1)[0]?.replace(/^\//, '') ?? ''
        const file = files.get(pathname)
        if (file === undefined) {
          next()
          return
        }
        response.setHeader(
          'Content-Type',
          MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
        )
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [fileName, file] of files)
        // Vite binds this hook to its PluginContext; asset emission must use that context (PLAN.md section 9).
        // eslint-disable-next-line unicorn/no-this-outside-of-class
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) })
    },
  }
}
