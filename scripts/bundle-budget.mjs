#!/usr/bin/env node
/**
 * Bundle-size budget gate (PLAN.md §5.5, M19). Fails (exit 1) when the initial
 * download for a surface, or any single route chunk, is over its gzip budget.
 * Sizes come from the client manifest through scripts/lib/bundle-sizes.mjs, so
 * the gate and the report (scripts/bundle-report.mjs) measure the same graph.
 *
 *   npm run build && node scripts/bundle-budget.mjs
 *
 * The route-chunk budget excludes the engine chunks reached only from the media
 * tools (video, pdf, the watermark worker): each rides its own long-cached chunk
 * by design (vite.config.ts) and is never part of a first paint.
 */
import { closureSizes, entryKey, fileSizes, kib, readManifest } from './lib/bundle-sizes.mjs'

const KB = 1024
/** PLAN.md §5.5 gzip budgets. */
const INITIAL_JS_BUDGET = 90 * KB
const SHELL_JS_BUDGET = 140 * KB
const ROUTE_CHUNK_BUDGET = 60 * KB
/** Chunks that ride their own long-cached group and never load on a first paint. */
const ENGINE_CHUNKS = new Set(['video', 'pdf', 'watermark', 'pipeline'])

const manifest = readManifest()
const entry = entryKey(manifest)
const initial = closureSizes(manifest, entry)

const failures = []
function check(label, actual, budget) {
  const isOk = actual <= budget
  console.info(
    `${isOk ? 'ok  ' : 'OVER'} ${label}: ${kib(actual)} kB gzip (budget ${kib(budget)} kB)`,
  )
  if (!isOk) {
    failures.push(`${label}: ${kib(actual)} kB gzip over ${kib(budget)} kB budget`)
  }
}

// The public entry is the boot closure every page shares today. Once public
// pages are split from the app shell (PLAN.md §5.5 §1–2) these diverge; the
// budgets are written for that end state and measured against it here.
check('initial JS for /', initial.js.gzip, INITIAL_JS_BUDGET)
check('initial JS for /app/* shell', initial.js.gzip, SHELL_JS_BUDGET)

for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.isDynamicEntry !== true || !(chunk.src ?? '').includes('/routes/')) {
    continue
  }
  const name = (chunk.name ?? key).replace(/\.\w+$/, '')
  if (ENGINE_CHUNKS.has(name)) {
    continue
  }
  const gzip = fileSizes(chunk.file).gzip
  if (gzip > ROUTE_CHUNK_BUDGET) {
    failures.push(
      `route chunk ${name}: ${kib(gzip)} kB gzip over ${kib(ROUTE_CHUNK_BUDGET)} kB budget`,
    )
  }
}

if (failures.length > 0) {
  console.error(`\nbundle budget missed (PLAN.md §5.5):`)
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exitCode = 1
} else {
  console.info('\nall bundle budgets met')
}
