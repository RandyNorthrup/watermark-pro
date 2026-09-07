/**
 * Canvas drawing of a mark. Works with both `OffscreenCanvas` (Web Worker)
 * and `HTMLCanvasElement` (main-thread engine) contexts; see `canvas.ts`.
 */
import type { Canvas2D } from './canvas'
import { INK, type ResolvedContrast } from './contrast'
import type { MarkGeometry } from './layout'
import { qrMatrix } from './qr'
import type { WatermarkSpec } from '../../shared/watermark'

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
/** Line pitch of multi-line text relative to the font size. */
const LINE_HEIGHT = 1.15
/** Icons come from a 24×24 viewBox with a 2px stroke. */
const ICON_VIEWBOX = 24
const ICON_STROKE = 2
/** Outline width and shadow blur relative to the mark height at full strength. */
const OUTLINE_RATIO = 0.06
const SHADOW_RATIO = 0.18
/** Padding and corner radius of the backdrop box relative to the mark height. */
const BACKDROP_PADDING_RATIO = 0.2
const BACKDROP_RADIUS_RATIO = 0.12
/** Quiet zone around a QR code, in modules; the standard asks for four, two scans reliably at these sizes. */
const QR_QUIET_MODULES = 2
/** QR codes are always dark on light: readers expect it and the field guarantees contrast. */
const QR_INK = INK.dark
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

/** The lines of a text or glyph mark; glyphs are always one line. */
function glyphLines(mark: RenderableMark): string[] {
  const { spec } = mark
  if (spec.kind === 'text') {
    return spec.text.split('\n')
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'glyph') {
    return [spec.symbol.glyph]
  }
  throw new TypeError('glyphLines is only defined for text and glyph marks')
}

/** Widest line at the probe size, never zero. */
function probeWidth(ctx: Canvas2D, mark: RenderableMark): number {
  ctx.font = glyphFont(mark, PROBE_FONT_SIZE)
  return Math.max(...glyphLines(mark).map((line) => ctx.measureText(line).width), 1)
}

/**
 * Width divided by height of the mark at any size. Text is measured at a
 * probe size; because glyph metrics scale linearly with the font size,
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
  if (spec.kind === 'qr' || (spec.kind === 'symbol' && spec.symbol.type === 'icon')) {
    return 1
  }
  const lines = glyphLines(mark)
  const width = probeWidth(ctx, mark)
  if (lines.length > 1) {
    return width / (PROBE_FONT_SIZE * LINE_HEIGHT * lines.length)
  }
  const metrics = ctx.measureText(lines[0] ?? '')
  const height =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || PROBE_FONT_SIZE
  return width / height
}

/** Font size at which the widest line fills `width`. */
function fontSizeFor(ctx: Canvas2D, mark: RenderableMark, width: number): number {
  return (width / probeWidth(ctx, mark)) * PROBE_FONT_SIZE
}

/** A box behind the mark in the opposite tone of the ink; the shadow is off while it is drawn. */
function drawBackdrop(
  ctx: Canvas2D,
  geometry: MarkGeometry,
  opacity: number,
  contrast: ResolvedContrast,
): void {
  const padding = geometry.height * BACKDROP_PADDING_RATIO
  const radius = geometry.height * BACKDROP_RADIUS_RATIO
  ctx.save()
  ctx.shadowBlur = 0
  ctx.globalAlpha *= opacity
  ctx.fillStyle = INK[contrast.variant].backdrop
  ctx.beginPath()
  ctx.roundRect(
    -geometry.width / 2 - padding,
    -geometry.height / 2 - padding,
    geometry.width + padding * 2,
    geometry.height + padding * 2,
    radius,
  )
  ctx.fill()
  ctx.restore()
}

function drawIcon(ctx: Canvas2D, mark: RenderableMark, width: number, contrast: ResolvedContrast) {
  if (mark.iconPath === undefined) {
    throw new TypeError('icon marks need resolved path data')
  }
  const scale = width / ICON_VIEWBOX
  ctx.scale(scale, scale)
  ctx.translate(-ICON_VIEWBOX / 2, -ICON_VIEWBOX / 2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const path = new Path2D(mark.iconPath)
  if (contrast.outline > 0) {
    ctx.strokeStyle = INK[contrast.variant].outline
    ctx.lineWidth = ICON_STROKE + ICON_STROKE * 2 * contrast.outline
    ctx.stroke(path)
  }
  ctx.strokeStyle = contrast.fill
  ctx.lineWidth = ICON_STROKE
  ctx.stroke(path)
}

function drawGlyphs(
  ctx: Canvas2D,
  mark: RenderableMark,
  width: number,
  contrast: ResolvedContrast,
): void {
  const fontSize = fontSizeFor(ctx, mark, width)
  ctx.font = glyphFont(mark, fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = glyphLines(mark)
  const pitch = fontSize * LINE_HEIGHT
  for (const [index, line] of lines.entries()) {
    const y = (index - (lines.length - 1) / 2) * pitch
    if (contrast.outline > 0) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK[contrast.variant].outline
      ctx.lineWidth = fontSize * OUTLINE_RATIO * contrast.outline
      ctx.strokeText(line, 0, y)
    }
    ctx.fillStyle = contrast.fill
    ctx.fillText(line, 0, y)
  }
}

/** Dark modules on a light field with a quiet zone, filling the mark's square. */
function drawQr(ctx: Canvas2D, content: string, size: number): void {
  const matrix = qrMatrix(content)
  const modules = matrix.size + QR_QUIET_MODULES * 2
  const cell = size / modules
  ctx.shadowBlur = 0
  ctx.fillStyle = QR_INK.backdrop
  ctx.fillRect(-size / 2, -size / 2, size, size)
  ctx.fillStyle = QR_INK.fill
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.isDark(row, column)) {
        ctx.fillRect(
          -size / 2 + (column + QR_QUIET_MODULES) * cell,
          -size / 2 + (row + QR_QUIET_MODULES) * cell,
          cell,
          cell,
        )
      }
    }
  }
}

/** Draws one instance of the mark centred at `geometry`. */
export function drawMark(
  ctx: Canvas2D,
  mark: RenderableMark,
  geometry: MarkGeometry,
  contrast: ResolvedContrast,
): void {
  const { spec } = mark
  ctx.save()
  ctx.globalAlpha = spec.style.opacity
  ctx.translate(geometry.centreX, geometry.centreY)
  ctx.rotate(-geometry.rotation * DEGREES_TO_RADIANS)
  ctx.shadowColor = INK[contrast.variant].outline
  ctx.shadowBlur = geometry.height * SHADOW_RATIO * contrast.outline

  if (spec.kind === 'qr') {
    drawQr(ctx, spec.content, geometry.width)
  } else if (spec.kind === 'image') {
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
  } else {
    if (spec.style.backdrop.enabled) {
      drawBackdrop(ctx, geometry, spec.style.backdrop.opacity, contrast)
    }
    if (spec.kind === 'symbol' && spec.symbol.type === 'icon') {
      drawIcon(ctx, mark, geometry.width, contrast)
    } else {
      drawGlyphs(ctx, mark, geometry.width, contrast)
    }
  }
  ctx.restore()
}
