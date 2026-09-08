#!/usr/bin/env node
/**
 * i18n:check (M18). Guards the English catalogue against drift the typed
 * resources cannot catch:
 *
 *  - dead keys: a key in `en/common.json` that no client source references, so
 *    it (and every translation of it) is wasted work;
 *  - missing keys: a `t('…')` / `<Trans i18nKey="…">` reference with no matching
 *    key in `en` (the typed catalogue already fails `tsc` on these; this is a
 *    belt-and-braces check that also covers indirectly-built keys).
 *
 * Usage is detected by collecting every quoted string literal in `src/client`
 * and matching leaf key paths against it, so keys referenced indirectly (a
 * `label: 'shell.nav.library'` in a config array, a `<Trans>` key) still count.
 * Keys built by interpolation (`t(\`x.${y}\`)`) cannot be seen statically; list
 * their leaf paths in ALLOW_DYNAMIC below with the reason.
 */
import { globSync, readFileSync } from 'node:fs'

const CATALOGUE = 'src/client/locales/en/common.json'
const SOURCE_GLOB = 'src/client/**/*.{ts,tsx}'
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

/** Leaf key paths whose keys are assembled at runtime and cannot be seen as a
 * literal; each needs a reason. Empty is the goal. */
const ALLOW_DYNAMIC = new Set()

function flatten(object, prefix, out) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (value !== null && typeof value === 'object') {
      flatten(value, path, out)
    } else {
      out.push(path)
    }
  }
}

/** Collapse a plural leaf (`foo.bar_one`) to the base key `t()` is called with. */
function pluralBase(path) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (path.endsWith(suffix)) {
      return path.slice(0, -suffix.length)
    }
  }
  return path
}

const compareText = (a, b) => a.localeCompare(b)

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'))
const leaves = []
flatten(catalogue, '', leaves)
const baseKeys = new Set(leaves.map((path) => pluralBase(path)))

const sources = globSync(SOURCE_GLOB).filter((file) => !/\.test\.tsx?$/.test(file))
const literals = new Set()
// One alternative per quote kind, each allowing an empty body, so an empty
// string (`''`) on a line pairs with itself instead of desyncing the scan and
// swallowing the next real literal.
const LITERAL = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(LITERAL)) {
    literals.add(match[1] ?? match[2] ?? match[3])
  }
}

const dead = [...baseKeys].filter((key) => !literals.has(key) && !ALLOW_DYNAMIC.has(key))

// A quoted string that looks like a catalogue path (`namespace.some.key`) but is
// absent from `en` — a reference to a key that was never added.
const namespaces = new Set(Object.keys(catalogue))
const missing = [...literals].filter(
  (value) =>
    /^[a-z][A-Za-z]*(\.[A-Za-z0-9_]+)+$/.test(value) &&
    namespaces.has(value.split('.', 1)[0]) &&
    !baseKeys.has(value) &&
    !leaves.includes(value),
)

let hasFailure = false
if (dead.length > 0) {
  hasFailure = true
  console.error(`i18n:check — ${String(dead.length)} dead key(s) in ${CATALOGUE}:`)
  for (const key of dead.toSorted(compareText)) {
    console.error(`  ${key}`)
  }
}
if (missing.length > 0) {
  hasFailure = true
  console.error(`i18n:check — ${String(missing.length)} referenced key(s) missing from en:`)
  for (const key of missing.toSorted(compareText)) {
    console.error(`  ${key}`)
  }
}
if (hasFailure) {
  process.exit(1)
}
console.info(`i18n:check — ${String(leaves.length)} keys, all referenced, none missing.`)
