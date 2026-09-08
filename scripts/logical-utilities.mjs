/**
 * One-off codemod (M18, "Right-to-left"): rewrite physical Tailwind utilities to
 * their logical equivalents across the client so the layout mirrors under
 * `dir="rtl"` (Arabic). Committed as the record of the sweep, not deleted.
 *
 * It rewrites the utility *root* only and preserves any variant prefix
 * (`md:`, `hover:`, `focus:`, `group-*:`, `dark:`) and any negative sign, because
 * those are unaffected by writing direction. Matches are anchored to a
 * class-token boundary (start of string, whitespace, quote, brace, paren, or a
 * variant colon) so a substring of an unrelated class is never touched
 * (`border-line`, `rounded-lg`, `to_right` in a gradient all stay put).
 *
 * Deliberately NOT rewritten, and why:
 * - The editor overlays (`crop-overlay.tsx`, `mark-overlay.tsx`): there
 *   left/right/inset are pixel geometry, not text direction. Excluded here and
 *   exempted in `eslint.config.mjs`; see PLAN.md §9.
 * - Fractional half insets (`left-1/2` / `right-1/2`): in this client every one
 *   centres a modal together with a physical `-translate-x-1/2` (transforms are
 *   never mirrored by `dir`), so converting them to `start-1/2` would push the
 *   dialog off-centre in RTL. Those lines keep the physical utility with a
 *   `physical: geometry` marker; see PLAN.md §9.
 * - `space-x-*`: only becomes `gap-*` on a genuine flex/grid parent. None exist
 *   in the client (verified: zero `space-x-` occurrences); the script reports any
 *   it sees for manual review rather than guessing the parent's display.
 *
 * Usage: `node scripts/logical-utilities.mjs` (writes in place) or
 * `node scripts/logical-utilities.mjs --dry` (report only).
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_DIR = path.join(ROOT, 'src', 'client')

/** Overlays where physical left/right/inset are geometry, not direction. */
const EXCLUDED = new Set(
  [
    'src/client/components/editor/crop-overlay.tsx',
    'src/client/components/editor/mark-overlay.tsx',
  ].map((relative) => path.join(ROOT, relative)),
)

/**
 * The character that must precede a utility for it to be its own class token:
 * start of string, whitespace, a quote (single, double or backtick), a brace,
 * a paren, or a variant separator `:`. Written as a plain string (backslashes
 * doubled) so the backtick can sit inside it without template-literal games.
 */
const BOUNDARY = '(^|[\\s"\'`{}():])'

const ROUNDED = { tl: 'ss', tr: 'se', bl: 'es', br: 'ee', l: 's', r: 'e' }
const MARGIN = { ml: 'ms', mr: 'me', pl: 'ps', pr: 'pe' }

/**
 * Each rule: a global regex whose first group is the leading boundary (put back
 * verbatim) and a function mapping the captured root to its logical form. Order
 * is irrelevant; every rule is applied once over the whole file text.
 */
const RULES = [
  {
    name: 'margin/padding',
    re: new RegExp(BOUNDARY + '(-?)(ml|mr|pl|pr)(?=-)', 'g'),
    replace: (_m, pre, neg, root) => `${pre}${neg}${MARGIN[root]}`,
  },
  {
    name: 'text-align',
    re: new RegExp(BOUNDARY + 'text-(left|right)(?=[\\s"\'`]|$)', 'g'),
    replace: (_m, pre, side) => `${pre}text-${side === 'left' ? 'start' : 'end'}`,
  },
  {
    name: 'border-side',
    re: new RegExp(BOUNDARY + 'border-(l|r)(?=[\\s"\'`-]|$)', 'g'),
    replace: (_m, pre, side) => `${pre}border-${side === 'l' ? 's' : 'e'}`,
  },
  {
    name: 'rounded-corner',
    re: new RegExp(BOUNDARY + 'rounded-(tl|tr|bl|br|l|r)(?=[\\s"\'`-]|$)', 'g'),
    replace: (_m, pre, corner) => `${pre}rounded-${ROUNDED[corner]}`,
  },
  {
    // Value-bearing insets only, and never a fractional half (centring geometry).
    name: 'inset',
    re: new RegExp(
      BOUNDARY + String.raw`(-?)(left|right)-(?=[\d.]|\[|auto|full|px)(?![\d.]*/)`,
      'g',
    ),
    replace: (_m, pre, neg, side) => `${pre}${neg}${side === 'left' ? 'start' : 'end'}-`,
  },
]

const SPACE_X = new RegExp(BOUNDARY + 'space-x-', 'g')

function collectTsx(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectTsx(full))
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

const isDry = process.argv.includes('--dry')
const changedFiles = []
const spaceXHits = []
// A property on an object, not a reassigned top-level binding, so the mutation
// inside the replace callback passes `unicorn/no-top-level-assignment-in-function`.
const stats = { total: 0 }

for (const file of collectTsx(CLIENT_DIR)) {
  if (EXCLUDED.has(file)) {
    continue
  }
  const original = readFileSync(file, 'utf8')
  let text = original
  const perFile = {}
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      perFile[rule.name] = (perFile[rule.name] ?? 0) + 1
      stats.total += 1
      return rule.replace(...args)
    })
  }
  for (const match of original.matchAll(SPACE_X)) {
    spaceXHits.push({ file: path.relative(ROOT, file), text: match[0].trim() })
  }
  if (text !== original) {
    changedFiles.push({ file: path.relative(ROOT, file), perFile })
    if (!isDry) {
      writeFileSync(file, text)
    }
  }
}

const heading = isDry ? 'Would rewrite' : 'Rewrote'
console.info(
  `${heading} ${String(stats.total)} utilities across ${String(changedFiles.length)} files:`,
)
for (const { file, perFile } of changedFiles) {
  const detail = Object.entries(perFile)
    .map(([name, count]) => `${name}×${String(count)}`)
    .join(', ')
  console.info(`  ${file}: ${detail}`)
}

console.info(
  spaceXHits.length === 0
    ? '\nspace-x-*: none found (nothing to convert to gap or review).'
    : '\nspace-x-* left for MANUAL review (convert to gap only on a flex/grid parent):',
)
for (const hit of spaceXHits) {
  console.info(`  ${hit.file}: ${hit.text}`)
}
