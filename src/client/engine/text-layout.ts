/** Measured glyph positions and ink bounds shared by selection, placement and rendering. */
import type { Canvas2D } from './canvas'
import type { Size } from './layout'

interface InkBox {
  left: number
  top: number
  right: number
  bottom: number
}

interface MeasuredGlyph extends InkBox {
  text: string
  advance: number
}

interface PositionedGlyph extends MeasuredGlyph {
  x: number
  y: number
  rotation: number
}

export interface TextLayout extends Size {
  /** Absolute probe-space ink bounds; drawing translates their center to the origin. */
  bounds: InkBox
  glyphs: PositionedGlyph[]
}

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
/** Binary search reaches well below a screen pixel even at maximum export dimensions. */
const RADIUS_STEPS = 32
const RADIUS_CLEARANCE = 0.001

/** Keeps emoji sequences, flags and combining marks together. */
export function clustersOf(line: string): string[] {
  return [...segmenter.segment(line)].map((entry) => entry.segment)
}

function measure(ctx: Canvas2D, text: string): MeasuredGlyph {
  const metrics = ctx.measureText(text)
  return {
    text,
    advance: metrics.width,
    left: -metrics.actualBoundingBoxLeft,
    right: metrics.actualBoundingBoxRight,
    top: -metrics.actualBoundingBoxAscent,
    bottom: metrics.actualBoundingBoxDescent,
  }
}

/** Includes every rotated ink-box corner, not just the curve's baseline. */
function boundsOf(glyphs: PositionedGlyph[]): InkBox {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const glyph of glyphs) {
    const cosine = Math.cos(glyph.rotation)
    const sine = Math.sin(glyph.rotation)
    for (const x of [glyph.left, glyph.right]) {
      for (const y of [glyph.top, glyph.bottom]) {
        const px = glyph.x + x * cosine - y * sine
        const py = glyph.y + x * sine + y * cosine
        left = Math.min(left, px)
        right = Math.max(right, px)
        top = Math.min(top, py)
        bottom = Math.max(bottom, py)
      }
    }
  }
  return { left, right, top, bottom }
}

function straightLine(ctx: Canvas2D, text: string, gap: number): PositionedGlyph[] {
  // One paint call retains the browser's kerning, ligatures and script shaping.
  if (gap === 0) return [{ ...measure(ctx, text), x: 0, y: 0, rotation: 0 }]
  let cursor = 0
  return clustersOf(text).map((cluster) => {
    const glyph = measure(ctx, cluster)
    const result = { ...glyph, x: cursor, y: 0, rotation: 0 }
    cursor += glyph.advance + gap
    return result
  })
}

function halfAngle(glyph: MeasuredGlyph, radius: number): number {
  const halfWidth = Math.max(glyph.advance, glyph.right - glyph.left) / 2
  const halfHeight = (glyph.bottom - glyph.top) / 2
  return Math.atan2(halfWidth, radius - halfHeight)
}

/** Reserve angular space for each whole glyph so bending cannot make neighbors collide. */
function curveRadius(glyphs: MeasuredGlyph[], gap: number, sweep: number): number {
  let low = Math.max(...glyphs.map((glyph) => (glyph.bottom - glyph.top) / 2)) + RADIUS_CLEARANCE
  const totalWidth = glyphs.reduce(
    (sum, glyph) => sum + Math.max(glyph.advance, glyph.right - glyph.left),
    gap * (glyphs.length - 1),
  )
  let high = low + totalWidth / sweep
  for (let step = 0; step < RADIUS_STEPS; step += 1) {
    const radius = (low + high) / 2
    const angle =
      glyphs.reduce((sum, glyph) => sum + 2 * halfAngle(glyph, radius), 0) +
      (gap * (glyphs.length - 1)) / radius
    if (angle > sweep) low = radius
    else high = radius
  }
  return high
}

function curvedLine(ctx: Canvas2D, text: string, gap: number, curve: number): PositionedGlyph[] {
  const glyphs = clustersOf(text).map((cluster) => measure(ctx, cluster))
  if (glyphs.length < 2) return straightLine(ctx, text, 0)
  // Negative tracking may overlap straight text intentionally. Curved ink must
  // still fit its own angular sector; extra positive tracking remains available.
  const safeGap = Math.max(0, gap)
  const sweep = Math.abs(curve) * Math.PI
  const sign = Math.sign(curve)
  const radius = curveRadius(glyphs, safeGap, sweep)
  let cursor = -sweep / 2
  return glyphs.map((glyph) => {
    const half = halfAngle(glyph, radius)
    const angle = cursor + half
    const rotation = angle * sign
    const cosine = Math.cos(rotation)
    const sine = Math.sin(rotation)
    const centerX = (glyph.left + glyph.right) / 2
    const centerY = (glyph.top + glyph.bottom) / 2
    cursor += 2 * half + safeGap / radius
    return {
      ...glyph,
      x: radius * Math.sin(angle) - centerX * cosine + centerY * sine,
      y: sign * radius * (1 - Math.cos(angle)) - centerX * sine - centerY * cosine,
      rotation,
    }
  })
}

/**
 * Layout at the current context font, with alphabetic baseline and left alignment.
 * Curved lines are stacked by their actual bounds so multiple lines never share
 * the same apex. Measurement and painting must use this same probe font size.
 */
export function layoutText(
  ctx: Canvas2D,
  lines: string[],
  spacing: number,
  curve: number,
  fontSize: number,
  lineHeight: number,
): TextLayout {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const glyphs: PositionedGlyph[] = []
  const lineGap = fontSize * (lineHeight - 1)
  let cursor = 0
  for (const text of lines) {
    if (text.length === 0) {
      cursor += fontSize * lineHeight
      continue
    }
    const line =
      curve === 0
        ? straightLine(ctx, text, spacing * fontSize)
        : curvedLine(ctx, text, spacing * fontSize, curve)
    const bounds = boundsOf(line)
    const center = (bounds.left + bounds.right) / 2
    for (const glyph of line) {
      glyphs.push({ ...glyph, x: glyph.x - center, y: glyph.y + cursor - bounds.top })
    }
    cursor += Math.max(bounds.bottom - bounds.top, fontSize) + lineGap
  }
  const bounds =
    glyphs.length === 0 ? { left: 0, top: 0, right: 1, bottom: fontSize } : boundsOf(glyphs)
  return {
    bounds,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
    glyphs,
  }
}
