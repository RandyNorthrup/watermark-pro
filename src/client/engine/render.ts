/**
 * Canvas drawing of a mark. Works with both `OffscreenCanvas` (Web Worker)
 * and `HTMLCanvasElement` (main-thread engine) contexts; see `canvas.ts`.
 */
import type { Canvas2D } from './canvas'
import { INK, type ResolvedContrast } from './contrast'
import type { MarkGeometry } from './layout'
import { type QrMatrix, qrMatrix } from './qr'
import { layoutText, type TextLayout } from './text-layout'
import type { Shape, TextEffect, WatermarkSpec } from '../../shared/watermark'
import { SHAPE_CATALOGUE, SHAPE_VIEWBOX } from '../shapes/catalogue'

/** A spec plus the binary resources it needs, resolved by the caller. */
export interface RenderableMark {
  spec: WatermarkSpec
  /** Required for `image` marks. */
  image?: ImageBitmap
  /** SVG path data (24×24 viewBox) for `icon` symbols. */
  iconPath?: string
  /** Seed for random placement; a stable value per photo (and per-layer salt). */
  seed?: number
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
/** DENSO WAVE specifies at least four clear modules around a standard QR symbol. */
const QR_QUIET_MODULES = 4
/** QR codes are always dark on light: readers expect it and the field guarantees contrast. */
const QR_INK = INK.dark
const HALF_TURN_DEGREES = 180
const DEGREES_TO_RADIANS = Math.PI / HALF_TURN_DEGREES
/** Glyph symbols are always drawn at regular weight. */
const GLYPH_WEIGHT = 400
/** Emboss and engrave offset the light and dark copies by this fraction of the font size. */
const EFFECT_OFFSET_RATIO = 0.04
/** The dimmed alpha of the ink layer over an emboss or engrave. */
const EFFECT_INK_ALPHA = 0.7
/** The outline effect strokes at least this strongly, even with a low outline setting. */
const MIN_OUTLINE_EFFECT = 0.5
/** Rounded-rectangle corner radius as a fraction of the shorter side. */
const SHAPE_CORNER_RATIO = 0.15

function fontString(family: string, weight: number, size: number): string {
  // A comma-separated stack (the emoji fonts) is passed through unquoted; a
  // single family name is quoted so spaces and digits are safe.
  const face = family.includes(',') ? family : `"${family}"`
  return `${String(weight)} ${String(size)}px ${face}`
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

/** Letter spacing, curve and effect of a mark; symbol glyphs use the defaults. */
function textParams(mark: RenderableMark): { spacing: number; curve: number; effect: TextEffect } {
  const { spec } = mark
  if (spec.kind === 'text') {
    return { spacing: spec.letterSpacing, curve: spec.curve, effect: spec.effect }
  }
  return { spacing: 0, curve: 0, effect: 'solid' }
}

/** One probe-space layout supplies both the selection dimensions and every painted glyph. */
function glyphLayout(ctx: Canvas2D, mark: RenderableMark): TextLayout {
  ctx.font = glyphFont(mark, PROBE_FONT_SIZE)
  const { spacing, curve } = textParams(mark)
  return layoutText(ctx, glyphLines(mark), spacing, curve, PROBE_FONT_SIZE, LINE_HEIGHT)
}

/**
 * Width divided by height of the mark at any size. Text is measured at a
 * probe size; because glyph metrics scale linearly with the font size,
 * the result is independent of the final scale.
 */
export function measureAspect(ctx: Canvas2D, mark: RenderableMark): number {
  const { spec } = mark
  if (spec.kind === 'image' || (spec.kind === 'symbol' && spec.symbol.type === 'sticker')) {
    if (mark.image === undefined) {
      throw new TypeError('image marks need a resolved bitmap')
    }
    return mark.image.width / mark.image.height
  }
  if (spec.kind === 'shape') {
    return (spec.aspect + spec.stroke.width) / (1 + spec.stroke.width)
  }
  if (spec.kind === 'qr' || (spec.kind === 'symbol' && spec.symbol.type === 'icon')) {
    return 1
  }
  const layout = glyphLayout(ctx, mark)
  return layout.width / layout.height
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

/** Paints one cluster at (x, y) with the chosen effect; the transform and font are already set. */
function paintGlyph(
  ctx: Canvas2D,
  char: string,
  x: number,
  y: number,
  fontSize: number,
  contrast: ResolvedContrast,
  effect: TextEffect,
): void {
  if (effect === 'outline') {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = contrast.fill
    ctx.lineWidth = fontSize * OUTLINE_RATIO * Math.max(contrast.outline, MIN_OUTLINE_EFFECT)
    ctx.strokeText(char, x, y)
    return
  }
  const offset = fontSize * EFFECT_OFFSET_RATIO
  if (effect === 'emboss' || effect === 'engrave') {
    const highlight = effect === 'emboss' ? INK.light.fill : INK.dark.fill
    const shadow = effect === 'emboss' ? INK.dark.fill : INK.light.fill
    ctx.fillStyle = highlight
    ctx.fillText(char, x - offset, y - offset)
    ctx.fillStyle = shadow
    ctx.fillText(char, x + offset, y + offset)
    ctx.save()
    ctx.globalAlpha *= EFFECT_INK_ALPHA
    ctx.fillStyle = contrast.fill
    ctx.fillText(char, x, y)
    ctx.restore()
    return
  }
  if (contrast.outline > 0) {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK[contrast.variant].outline
    ctx.lineWidth = fontSize * OUTLINE_RATIO * contrast.outline
    ctx.strokeText(char, x, y)
  }
  ctx.fillStyle = contrast.fill
  ctx.fillText(char, x, y)
}

/** Paint the measured layout at one uniform scale; never change the probe font mid-run. */
function drawGlyphs(
  ctx: Canvas2D,
  mark: RenderableMark,
  width: number,
  contrast: ResolvedContrast,
): void {
  const layout = glyphLayout(ctx, mark)
  const factor = width / layout.width
  const { effect } = textParams(mark)
  if (effect === 'outline') ctx.shadowBlur = 0
  ctx.scale(factor, factor)
  ctx.translate(
    -(layout.bounds.left + layout.bounds.right) / 2,
    -(layout.bounds.top + layout.bounds.bottom) / 2,
  )
  for (const glyph of layout.glyphs) {
    ctx.save()
    ctx.translate(glyph.x, glyph.y)
    ctx.rotate(glyph.rotation)
    paintGlyph(ctx, glyph.text, 0, 0, PROBE_FONT_SIZE, contrast, effect)
    ctx.restore()
  }
}

/** Draws the selected geometric mark at output resolution with independent fill and stroke. */
function drawShape(
  ctx: Canvas2D,
  spec: Extract<WatermarkSpec, { kind: 'shape' }>,
  geometry: MarkGeometry,
  contrast: ResolvedContrast,
): void {
  // Geometry describes the outside of the stroke, not the centerline of its path.
  const height = geometry.height / (1 + spec.stroke.width)
  const strokeWidth = height * spec.stroke.width
  const width = geometry.width - strokeWidth
  const halfWidth = width / 2
  const halfHeight = height / 2
  const shorter = Math.min(width, height)
  ctx.shadowBlur = 0
  ctx.lineJoin = 'round'
  const path = new Path2D()
  const shape: Shape = spec.shape
  switch (shape) {
    case 'ellipse': {
      path.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2)
      break
    }
    case 'rectangle': {
      path.rect(-halfWidth, -halfHeight, width, height)
      break
    }
    case 'rounded-rectangle':
    case 'line': {
      const radius = shape === 'line' ? halfHeight : shorter * SHAPE_CORNER_RATIO
      path.roundRect(-halfWidth, -halfHeight, width, height, radius)
      break
    }
    default: {
      path.addPath(new Path2D(SHAPE_CATALOGUE[shape].path), {
        a: width / SHAPE_VIEWBOX,
        d: height / SHAPE_VIEWBOX,
        e: -halfWidth,
        f: -halfHeight,
      })
    }
  }
  if (spec.fill.enabled) {
    ctx.save()
    ctx.globalAlpha *= spec.fill.opacity
    ctx.fillStyle = spec.fill.colour
    ctx.fill(path)
    ctx.restore()
  }
  if (spec.stroke.width > 0) {
    // A chosen stroke colour, else the auto-contrast ink.
    ctx.strokeStyle = spec.stroke.colour ?? contrast.fill
    ctx.lineWidth = strokeWidth
    ctx.stroke(path)
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
    drawQrRow(ctx, matrix, row, size, cell)
  }
}

/** Integer module edges keep adjacent dark cells connected for QR readers. */
function drawQrRow(ctx: Canvas2D, matrix: QrMatrix, row: number, size: number, cell: number): void {
  const top = Math.round(-size / 2 + (row + QR_QUIET_MODULES) * cell)
  const bottom = Math.round(-size / 2 + (row + QR_QUIET_MODULES + 1) * cell)
  for (let column = 0; column < matrix.size; column += 1) {
    if (!matrix.isDark(row, column)) continue
    const left = Math.round(-size / 2 + (column + QR_QUIET_MODULES) * cell)
    const right = Math.round(-size / 2 + (column + QR_QUIET_MODULES + 1) * cell)
    ctx.fillRect(left, top, right - left, bottom - top)
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

  switch (spec.kind) {
    case 'qr': {
      drawQr(ctx, spec.content, geometry.width)
      break
    }
    case 'shape': {
      drawShape(ctx, spec, geometry, contrast)
      break
    }
    case 'image': {
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
      break
    }
    default: {
      // Text and symbol marks: an optional backdrop, then the glyphs or icon.
      if (spec.style.backdrop.enabled) {
        drawBackdrop(ctx, geometry, spec.style.backdrop.opacity, contrast)
      }
      if (spec.kind === 'symbol' && spec.symbol.type === 'sticker') {
        if (mark.image === undefined) throw new TypeError('sticker marks need a resolved bitmap')
        ctx.drawImage(
          mark.image,
          -geometry.width / 2,
          -geometry.height / 2,
          geometry.width,
          geometry.height,
        )
      } else if (spec.kind === 'symbol' && spec.symbol.type === 'icon') {
        drawIcon(ctx, mark, geometry.width, contrast)
      } else {
        drawGlyphs(ctx, mark, geometry.width, contrast)
      }
    }
  }
  ctx.restore()
}
