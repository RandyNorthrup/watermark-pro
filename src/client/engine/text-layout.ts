/**
 * Text run measurement and arc geometry, shared by the drawing code and the
 * aspect measurement. Letter spacing is applied between grapheme clusters
 * (so emoji and combining marks stay intact); an arc bends the run around a
 * circle whose radius follows the run width.
 */
import type { Canvas2D } from './canvas'
import type { Size } from './layout'

export interface Glyph {
  char: string
  /** Distance from this cluster's start to the next cluster's start. */
  advance: number
}

export interface GlyphRun {
  glyphs: Glyph[]
  width: number
}

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })

/** Splits a line into grapheme clusters. */
export function clustersOf(line: string): string[] {
  return [...segmenter.segment(line)].map((entry) => entry.segment)
}

/**
 * Measures a line as a run of clusters with `spacing` (a fraction of the font
 * size) added after every cluster but the last. `ctx.font` must already be
 * set to the size being measured.
 */
export function measureRun(
  ctx: Canvas2D,
  line: string,
  spacing: number,
  fontSize: number,
): GlyphRun {
  const clusters = clustersOf(line)
  const gap = spacing * fontSize
  let width = 0
  const glyphs = clusters.map((char, index) => {
    const isLast = index === clusters.length - 1
    const advance = ctx.measureText(char).width + (isLast ? 0 : gap)
    width += advance
    return { char, advance }
  })
  return { glyphs, width: Math.max(width, 1) }
}

/**
 * Bounding box of arced (or straight) text. `runWidth` is the widest line's
 * run width, measured at `fontSize`; the result scales linearly with the font
 * size, so it can be measured at a probe size and reused at any scale.
 * For a curve `k`, the arc angle is `|k|·π` and the radius `runWidth / angle`.
 */
export function arcBounds(
  runWidth: number,
  fontSize: number,
  lineCount: number,
  curve: number,
  lineHeight: number,
): Size {
  const block = fontSize * lineHeight * lineCount
  if (curve === 0) {
    return { width: runWidth, height: block }
  }
  const angle = Math.abs(curve) * Math.PI
  const radius = runWidth / angle
  const half = angle / 2
  return {
    width: 2 * radius * Math.sin(half),
    height: radius * (1 - Math.cos(half)) + block,
  }
}
