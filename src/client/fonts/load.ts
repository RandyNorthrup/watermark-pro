/**
 * Runtime side of the font catalogue: injects a family's @font-face CSS for
 * page previews and resolves the woff2 URL the engine worker renders with.
 * Kept apart from the catalogue data so Node-side audits can import the data
 * without dragging in browser types.
 *
 * Vite turns the glob patterns below into one lazy loader per matching file
 * at build time, so every family is code-split and nothing is fetched until
 * it is chosen. The patterns are deliberately narrow: the two static weights
 * the designer offers and the single variable-weight file.
 */
import { findFont, type FontFamily, nearestWeight } from './catalogue'
import type { FontResource } from '../engine/protocol'

const STYLE_LOADERS = import.meta.glob([
  '/node_modules/@fontsource/*/latin-{400,700}.css',
  '/node_modules/@fontsource-variable/*/wght.css',
])

const FILE_LOADERS = import.meta.glob<string>(
  [
    '/node_modules/@fontsource/*/files/*-latin-{400,700}-normal.woff2',
    '/node_modules/@fontsource-variable/*/files/*-latin-wght-normal.woff2',
  ],
  { query: '?url', import: 'default' },
)

/** Fontsource file naming: `<id>-latin-<weight|wght>-normal.woff2`. */
export function fontFileKey(font: FontFamily, weight: number): string {
  const axis = font.isVariable ? 'wght' : String(weight)
  return `/node_modules/${font.packageName}/files/${font.id}-latin-${axis}-normal.woff2`
}

/** Latin-only stylesheet for the exact weight; variable packages ship one sheet per axis. */
function styleKey(font: FontFamily, weight: number): string {
  const sheet = font.isVariable ? 'wght' : `latin-${String(weight)}`
  return `/node_modules/${font.packageName}/${sheet}.css`
}

const loadedStyles = new Set<string>()

/**
 * Makes a family usable on the page (for previews) and returns the resource
 * the engine worker needs to render it. Throws for unknown families rather
 * than silently falling back to a system font.
 */
export async function loadFont(family: string, weight: number): Promise<FontResource> {
  const font = findFont(family)
  if (font === undefined) {
    throw new Error(`unknown font family: ${family}`)
  }
  const resolvedWeight = nearestWeight(font, weight)
  const sheet = styleKey(font, resolvedWeight)
  const loadStyles = STYLE_LOADERS[sheet]
  if (loadStyles === undefined) {
    throw new Error(`no stylesheet bundled for ${family} at weight ${String(resolvedWeight)}`)
  }
  if (!loadedStyles.has(sheet)) {
    await loadStyles()
    loadedStyles.add(sheet)
  }
  const loadFile = FILE_LOADERS[fontFileKey(font, resolvedWeight)]
  if (loadFile === undefined) {
    throw new Error(`no file bundled for ${family} at weight ${String(resolvedWeight)}`)
  }
  return { family, weight: resolvedWeight, url: await loadFile() }
}
