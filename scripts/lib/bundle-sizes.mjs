/**
 * Bundle-size measurement shared by the report (scripts/bundle-report.mjs) and
 * the budget gate (scripts/bundle-budget.mjs). Reads the client build manifest
 * that Vite emits at dist/client/.vite/manifest.json (build.manifest is on in
 * vite.config.ts) and computes gzip and brotli sizes from the real chunk graph,
 * so both tools agree on what "initial load" means for a route.
 *
 * No dependency: sizes come from node:zlib at the same settings a CDN serves
 * (gzip level 9, brotli quality 11).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export const CLIENT_DIR = path.join('dist', 'client')
const MANIFEST_PATH = path.join(CLIENT_DIR, '.vite', 'manifest.json')

/** Reads the client manifest, or throws a message that names the build to run. */
export function readManifest() {
  let raw
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8')
  } catch {
    throw new Error(
      `client manifest not found at ${MANIFEST_PATH}; run "npm run build" first (build.manifest must be on in vite.config.ts)`,
    )
  }
  return JSON.parse(raw)
}

const sizeCache = new Map()

/** Raw, gzip and brotli byte sizes of one built file, memoised across calls. */
export function fileSizes(file) {
  const cached = sizeCache.get(file)
  if (cached !== undefined) {
    return cached
  }
  const bytes = readFileSync(path.join(CLIENT_DIR, file))
  const sizes = {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
  sizeCache.set(file, sizes)
  return sizes
}

/**
 * Every chunk key reachable from `startKey` through static `imports` only
 * (never `dynamicImports`): the set of JavaScript a browser must download and
 * run before the code at `startKey` executes. Includes `startKey` itself.
 */
export function staticClosure(manifest, startKey) {
  const reached = new Set()
  const walk = (key) => {
    if (reached.has(key)) {
      return
    }
    reached.add(key)
    const chunk = manifest[key]
    if (chunk === undefined) {
      return
    }
    const imports = chunk.imports ?? []
    for (const next of imports) {
      walk(next)
    }
  }
  walk(startKey)
  return reached
}

/** The single `isEntry` chunk key (the app's boot module). */
export function entryKey(manifest) {
  const found = Object.keys(manifest).find((key) => manifest[key].isEntry === true)
  if (found === undefined) {
    throw new Error('no isEntry chunk in the client manifest')
  }
  return found
}

/** Summed gzip/brotli JS and CSS for the static closure of a manifest key. */
export function closureSizes(manifest, startKey) {
  const keys = staticClosure(manifest, startKey)
  const js = { gzip: 0, brotli: 0, raw: 0 }
  const cssFiles = new Set()
  for (const key of keys) {
    const chunk = manifest[key]
    if (chunk === undefined) {
      continue
    }
    const sizes = fileSizes(chunk.file)
    js.gzip += sizes.gzip
    js.brotli += sizes.brotli
    js.raw += sizes.raw
    const cssList = chunk.css ?? []
    for (const css of cssList) {
      cssFiles.add(css)
    }
  }
  const css = { gzip: 0, brotli: 0, raw: 0 }
  for (const file of cssFiles) {
    const sizes = fileSizes(file)
    css.gzip += sizes.gzip
    css.brotli += sizes.brotli
    css.raw += sizes.raw
  }
  return { keys, js, css, cssFiles }
}

/** kB with one decimal, from a byte count, for reports and messages. */
export function kib(bytes) {
  return (bytes / 1024).toFixed(1)
}
