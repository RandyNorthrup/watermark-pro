#!/usr/bin/env node
/**
 * Bundle-size budget gate (PLAN.md §5.5, M19). Fails (exit 1) when the initial
 * download for a surface, or any single route chunk, is over its gzip budget.
 * Sizes come from the client manifest through scripts/lib/bundle-sizes.mjs, so
 * the gate and the report (scripts/bundle-report.mjs) measure the same graph.
 *
 *   npm run build && node scripts/bundle-budget.mjs
 *
 * Every statically required route dependency is measured, with no engine exemptions.
 * Action/detection imports are listed separately by bundle:report; Lighthouse
 * observes actual route startup, including async work.
 */
import {
  applicationBootSizes,
  entryKey,
  fileSizes,
  kib,
  publicPageSizes,
  readManifest,
  staticClosure,
} from './lib/bundle-sizes.mjs'

const KB = 1024
/** PLAN.md §5.5 gzip budgets. */
const INITIAL_JS_BUDGET = 90 * KB
const SHELL_JS_BUDGET = 140 * KB
const ROUTE_CHUNK_BUDGET = 60 * KB
const manifest = readManifest()
const entry = entryKey(manifest)
const initial = applicationBootSizes(manifest, entry)

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

for (const page of publicPageSizes())
  check(`public landing JS (${page.locale})`, page.gzip, INITIAL_JS_BUDGET)
check('initial JS for /app/* shell', initial.js.gzip, SHELL_JS_BUDGET)

const routeDependencies = new Set()
for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.isDynamicEntry !== true || !(chunk.src ?? '').includes('/routes/')) {
    continue
  }
  for (const dependency of staticClosure(manifest, key)) {
    if (!initial.keys.has(dependency)) routeDependencies.add(dependency)
  }
}
for (const key of routeDependencies) {
  const chunk = manifest[key]
  const name = (chunk.name ?? key).replace(/\.\w+$/, '')
  if (!chunk.file.endsWith('.js')) continue
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
