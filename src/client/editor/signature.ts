/**
 * A finger- or pen-drawn signature as data: strokes of points in pad
 * pixels. Pure so the pad's behaviour (bounds, trimming, scaling to the
 * saved image) is testable without a canvas.
 */
import type { Canvas2D } from '../engine/canvas'

export interface StrokePoint {
  x: number
  y: number
}

export interface Stroke {
  points: StrokePoint[]
  /** Pen width in pad pixels. */
  width: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Pen widths on offer, in pad pixels: fine, regular, bold and marker. */
const FINE_PEN = 2
const REGULAR_PEN = 4
const BOLD_PEN = 6
const MARKER_PEN = 10
export const PEN_WIDTHS = [FINE_PEN, REGULAR_PEN, BOLD_PEN, MARKER_PEN] as const
export const DEFAULT_PEN_WIDTH = REGULAR_PEN
/** Transparent space kept around the ink in the saved logo, relative to its longer side. */
export const SIGNATURE_PADDING_RATIO = 0.08
/** The saved logo's longer side; large enough to stay crisp at watermark sizes. */
export const SIGNATURE_EXPORT_SIDE = 1024
/** Ink colour: near-black, so auto contrast treats it like any other dark logo. */
export const SIGNATURE_INK = '#0f172a'

/** The rectangle the strokes cover, pen width included; null with no ink. */
export function strokeBounds(strokes: readonly Stroke[]): Bounds | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const stroke of strokes) {
    const half = stroke.width / 2
    for (const point of stroke.points) {
      left = Math.min(left, point.x - half)
      top = Math.min(top, point.y - half)
      right = Math.max(right, point.x + half)
      bottom = Math.max(bottom, point.y + half)
    }
  }
  if (!Number.isFinite(left)) {
    return null
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Draws the strokes with round joins so a fast finger still leaves a smooth line. */
export function drawStrokes(ctx: Canvas2D, strokes: readonly Stroke[], scale = 1): void {
  ctx.strokeStyle = SIGNATURE_INK
  ctx.fillStyle = SIGNATURE_INK
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    const [first, ...rest] = stroke.points
    if (first === undefined) {
      continue
    }
    if (rest.length === 0) {
      // A tap: a dot the size of the pen.
      ctx.beginPath()
      ctx.arc(first.x * scale, first.y * scale, (stroke.width * scale) / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.lineWidth = stroke.width * scale
    ctx.beginPath()
    ctx.moveTo(first.x * scale, first.y * scale)
    for (const point of rest) {
      ctx.lineTo(point.x * scale, point.y * scale)
    }
    ctx.stroke()
  }
}

/**
 * The saved logo's geometry: the ink's bounds plus padding, scaled so the
 * longer side is `SIGNATURE_EXPORT_SIDE`.
 */
export function exportGeometry(bounds: Bounds): {
  scale: number
  width: number
  height: number
  offsetX: number
  offsetY: number
} {
  const padding = Math.max(bounds.width, bounds.height) * SIGNATURE_PADDING_RATIO
  const paddedWidth = bounds.width + padding * 2
  const paddedHeight = bounds.height + padding * 2
  const scale = SIGNATURE_EXPORT_SIDE / Math.max(paddedWidth, paddedHeight)
  return {
    scale,
    width: Math.max(1, Math.round(paddedWidth * scale)),
    height: Math.max(1, Math.round(paddedHeight * scale)),
    offsetX: padding - bounds.x,
    offsetY: padding - bounds.y,
  }
}
