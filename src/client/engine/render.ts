/**
 * Canvas drawing of a mark. Works with both `OffscreenCanvas` (Web Worker)
 * and `HTMLCanvasElement` (editor preview) contexts.
 */
import { INK, type ResolvedContrast } from './contrast'
import type { MarkGeometry } from './layout'
import type { WatermarkSpec } from '../../shared/watermark'

/**
 * Both the worker (OffscreenCanvas) and the editor (HTMLCanvasElement) hand
 * over a 2D context. The offscreen type is the common denominator available
 * under the WebWorker library; the DOM context is structurally compatible for
 * every method used here.
 */
export type Canvas2D = OffscreenCanvasRenderingContext2D

/** A spec plus the binary resources it needs, resolved by the caller. */
export interface RenderableMark {
  spec: WatermarkSpec
  /** Required for `image` marks. */
  image?: ImageBitmap
  /** SVG path data (24×24 viewBox) for `icon` symbols. */
  iconPath?: string
}

/** Font size used to measure text before scaling it to the target width. */
const PROBE_FONT_SIZE = 100
/** Icons come from a 24×24 viewBox with a 2px stroke. */
const ICON_VIEWBOX = 24
const ICON_STROKE = 2
/** Outline width and shadow blur relative to the mark height at full strength. */
const OUTLINE_RATIO = 0.06
const SHADOW_RATIO = 0.18
const HALF_TURN_DEGREES = 180
const DEGREES_TO_RADIANS = Math.PI / HALF_TURN_DEGREES
/** Glyph symbols are always drawn at regular weight. */
const GLYPH_WEIGHT = 400

function fontString(family: string, weight: number, size: number): string {
  return `${String(weight)} ${String(size)}px "${family}"`
}

function glyphFont(mark: RenderableMark, size: number): string {
  const { spec } = mark
  if (spec.kind === 'text') {
    return fontString(spec.fontFamily, spec.fontWeight, size)
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'glyph') {
    return fontString(spec.symbol.fontFamily, GLYPH_WEIGHT, size)
  }
  throw new TypeError('glyphFont is only defined for text and glyph marks')
}

function glyphText(mark: RenderableMark): string {
  const { spec } = mark
  if (spec.kind === 'text') {
    return spec.text
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'glyph') {
    return spec.symbol.glyph
  }
  throw new TypeError('glyphText is only defined for text and glyph marks')
}

/**
 * Intrinsic width / height of the mark. Text is measured at a probe size so
 * the result is independent of the final scale.
 */
export function measureAspect(ctx: Canvas2D, mark: RenderableMark): number {
  const { spec } = mark
  if (spec.kind === 'image') {
    if (mark.image === undefined) {
      throw new TypeError('image marks need a resolved bitmap')
    }
    return mark.image.width / mark.image.height
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'icon') {
    return 1
  }
  ctx.font = glyphFont(mark, PROBE_FONT_SIZE)
  const metrics = ctx.measureText(glyphText(mark))
  const height =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || PROBE_FONT_SIZE
  return Math.max(metrics.width, 1) / height
}

/** Font size at which the glyph fills `geometry.width`. */
function fontSizeFor(ctx: Canvas2D, mark: RenderableMark, width: number): number {
  ctx.font = glyphFont(mark, PROBE_FONT_SIZE)
  const probeWidth = Math.max(ctx.measureText(glyphText(mark)).width, 1)
  return (width / probeWidth) * PROBE_FONT_SIZE
}

/** Draws one instance of the mark centred at `geometry`. */
export function drawMark(
  ctx: Canvas2D,
  mark: RenderableMark,
  geometry: MarkGeometry,
  contrast: ResolvedContrast,
): void {
  const { spec } = mark
  const ink = INK[contrast.variant]
  ctx.save()
  ctx.globalAlpha = spec.style.opacity
  ctx.translate(geometry.centreX, geometry.centreY)
  ctx.rotate(-geometry.rotation * DEGREES_TO_RADIANS)
  ctx.shadowColor = ink.outline
  ctx.shadowBlur = geometry.height * SHADOW_RATIO * contrast.outline

  if (spec.kind === 'image') {
    if (mark.image === undefined) {
      throw new TypeError('image marks need a resolved bitmap')
    }
    ctx.drawImage(
      mark.image,
      -geometry.width / 2,
      -geometry.height / 2,
      geometry.width,
      geometry.height,
    )
  } else if (spec.kind === 'symbol' && spec.symbol.type === 'icon') {
    if (mark.iconPath === undefined) {
      throw new TypeError('icon marks need resolved path data')
    }
    const scale = geometry.width / ICON_VIEWBOX
    ctx.scale(scale, scale)
    ctx.translate(-ICON_VIEWBOX / 2, -ICON_VIEWBOX / 2)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const path = new Path2D(mark.iconPath)
    if (contrast.outline > 0) {
      ctx.strokeStyle = ink.outline
      ctx.lineWidth = ICON_STROKE + ICON_STROKE * 2 * contrast.outline
      ctx.stroke(path)
    }
    ctx.strokeStyle = ink.fill
    ctx.lineWidth = ICON_STROKE
    ctx.stroke(path)
  } else {
    const fontSize = fontSizeFor(ctx, mark, geometry.width)
    ctx.font = glyphFont(mark, fontSize)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = glyphText(mark)
    if (contrast.outline > 0) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = ink.outline
      ctx.lineWidth = fontSize * OUTLINE_RATIO * contrast.outline
      ctx.strokeText(text, 0, 0)
    }
    ctx.fillStyle = ink.fill
    ctx.fillText(text, 0, 0)
  }
  ctx.restore()
}
