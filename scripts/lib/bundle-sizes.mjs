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
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

import { JSDOM } from 'jsdom'

export const CLIENT_DIR = process.env.LUMAFOIL_CLIENT_DIR ?? path.join('dist', 'client')
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
const SCRIPT_ORIGIN = 'https://built-assets.example'

function compressedSizes(bytes) {
  return {
    raw: Buffer.byteLength(bytes),
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
}

function addSizes(total, addition) {
  total.raw += addition.raw
  total.gzip += addition.gzip
  total.brotli += addition.brotli
}

/** Raw, gzip and brotli byte sizes of one built file, memoised across calls. */
export function fileSizes(file) {
  const cached = sizeCache.get(file)
  if (cached !== undefined) {
    return cached
  }
  const bytes = readFileSync(path.join(CLIENT_DIR, file))
  const sizes = compressedSizes(bytes)
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
      throw new Error(`Build manifest references missing chunk ${key}.`)
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
function closureSizes(manifest, startKey) {
  const keys = staticClosure(manifest, startKey)
  const js = { gzip: 0, brotli: 0, raw: 0 }
  const cssFiles = new Set()
  for (const key of keys) {
    const chunk = manifest[key]
    if (chunk === undefined) throw new Error(`Build manifest references missing chunk ${key}.`)
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

function documentScriptSizes(document, excludedFiles = new Set()) {
  const scripts = new Set()
  const sizes = { raw: 0, gzip: 0, brotli: 0 }
  let inlineScripts = 0
  for (const script of document.querySelectorAll('script')) {
    const src = script.getAttribute('src')
    if (src === null) {
      addSizes(sizes, compressedSizes(script.textContent ?? ''))
      inlineScripts += 1
      continue
    }
    const url = new URL(src, SCRIPT_ORIGIN)
    if (url.origin !== SCRIPT_ORIGIN) throw new Error(`Unmeasured external document script: ${src}`)
    const file = url.pathname.slice(1)
    if (!excludedFiles.has(file)) scripts.add(file)
  }
  for (const script of scripts) addSizes(sizes, fileSizes(script))
  return { ...sizes, scripts: scripts.size, inlineScripts }
}

/** Count the actual document controller code as well as its statically imported application graph. */
export function applicationBootSizes(manifest, startKey) {
  const initial = closureSizes(manifest, startKey)
  const html = readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8')
  const document = new JSDOM(html).window.document
  const initialFiles = new Set([...initial.keys].map((key) => manifest[key].file))
  const documentScripts = documentScriptSizes(document, initialFiles)
  const js = { ...initial.js }
  addSizes(js, documentScripts)
  const map = document.querySelector('template#app-route-preloads')?.content.textContent ?? ''
  return {
    ...initial,
    js,
    documentScripts: documentScripts.scripts + documentScripts.inlineScripts,
    resourceMap: map === '' ? { raw: 0, gzip: 0, brotli: 0 } : compressedSizes(map),
  }
}

/** Measure the scripts actually present in every prerendered locale, including the inline theme resolver. */
export function publicPageSizes() {
  const directory = path.join(CLIENT_DIR, 'landing')
  const pages = readdirSync(directory).filter((file) => file.endsWith('.html'))
  if (pages.length === 0)
    throw new Error('No prerendered landing pages exist; run the canonical build.')
  return pages.map((file) => {
    const html = readFileSync(path.join(directory, file), 'utf8')
    const document = new JSDOM(html).window.document
    const sizes = documentScriptSizes(document)
    return { locale: file.slice(0, -'.html'.length), gzip: sizes.gzip, scripts: sizes.scripts }
  })
}

/** kB with one decimal, from a byte count, for reports and messages. */
export function kib(bytes) {
  return (bytes / 1024).toFixed(1)
}
