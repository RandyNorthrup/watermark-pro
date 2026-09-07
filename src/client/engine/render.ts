/**
 * Canvas drawing of a mark. Works with both `OffscreenCanvas` (Web Worker)
 * and `HTMLCanvasElement` (main-thread engine) contexts; see `canvas.ts`.
 */
import type { Canvas2D } from './canvas'
import { INK, type ResolvedContrast } from './contrast'
import type { MarkGeometry } from './layout'
import { qrMatrix } from './qr'
import { arcBounds, measureRun } from './text-layout'
import type { Shape, TextEffect, WatermarkSpec } from '../../shared/watermark'

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
/** Quiet zone around a QR code, in modules; the standard asks for four, two scans reliably at these sizes. */
const QR_QUIET_MODULES = 2
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

/** Widest run width at the probe size, with letter spacing, never zero. */
function probeRunWidth(ctx: Canvas2D, mark: RenderableMark, spacing: number): number {
  ctx.font = glyphFont(mark, PROBE_FONT_SIZE)
  return Math.max(
    ...glyphLines(mark).map((line) => measureRun(ctx, line, spacing, PROBE_FONT_SIZE).width),
    1,
  )
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
  if (spec.kind === 'shape') {
    return spec.aspect
  }
  if (spec.kind === 'qr' || (spec.kind === 'symbol' && spec.symbol.type === 'icon')) {
    return 1
  }
  const { spacing, curve } = textParams(mark)
  const lines = glyphLines(mark)
  const runWidth = probeRunWidth(ctx, mark, spacing)
  if (curve === 0 && lines.length === 1) {
    const metrics = ctx.measureText(lines[0] ?? '')
    const height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || PROBE_FONT_SIZE
    return runWidth / height
  }
  const box = arcBounds(runWidth, PROBE_FONT_SIZE, lines.length, curve, LINE_HEIGHT)
  return box.width / box.height
}

/** Font size at which the arced (or straight) text box fills `width`. */
function fontSizeFor(ctx: Canvas2D, mark: RenderableMark, width: number): number {
  const { spacing, curve } = textParams(mark)
  const lines = glyphLines(mark)
  const probeWidthValue = probeRunWidth(ctx, mark, spacing)
  const box = arcBounds(probeWidthValue, PROBE_FONT_SIZE, lines.length, curve, LINE_HEIGHT)
  return (width / box.width) * PROBE_FONT_SIZE
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

/** Draws one line straight, its run centred on the origin. */
function drawStraightLine(
  ctx: Canvas2D,
  line: string,
  y: number,
  spacing: number,
  fontSize: number,
  contrast: ResolvedContrast,
  effect: TextEffect,
): void {
  if (spacing === 0) {
    // Keep kerning and ligatures: one call for the whole line.
    ctx.textAlign = 'center'
    paintGlyph(ctx, line, 0, y, fontSize, contrast, effect)
    return
  }
  ctx.textAlign = 'left'
  const run = measureRun(ctx, line, spacing, fontSize)
  let cursor = -run.width / 2
  for (const glyph of run.glyphs) {
    paintGlyph(ctx, glyph.char, cursor, y, fontSize, contrast, effect)
    cursor += glyph.advance
  }
}

/** Draws one line along an arc of radius `radius`; `sign` is +1 to bend over the top. */
function drawArcLine(
  ctx: Canvas2D,
  line: string,
  radius: number,
  sign: number,
  spacing: number,
  fontSize: number,
  contrast: ResolvedContrast,
  effect: TextEffect,
): void {
  ctx.textAlign = 'center'
  const run = measureRun(ctx, line, spacing, fontSize)
  let cursor = 0
  for (const glyph of run.glyphs) {
    const centre = cursor + glyph.advance / 2
    const angle = ((centre - run.width / 2) / radius) * sign
    ctx.save()
    ctx.translate(0, sign * radius)
    ctx.rotate(angle)
    ctx.translate(0, -sign * radius)
    paintGlyph(ctx, glyph.char, 0, 0, fontSize, contrast, effect)
    ctx.restore()
    cursor += glyph.advance
  }
}

function drawGlyphs(
  ctx: Canvas2D,
  mark: RenderableMark,
  width: number,
  contrast: ResolvedContrast,
): void {
  const fontSize = fontSizeFor(ctx, mark, width)
  ctx.font = glyphFont(mark, fontSize)
  ctx.textBaseline = 'middle'
  const { spacing, curve, effect } = textParams(mark)
  if (effect === 'outline') {
    ctx.shadowBlur = 0
  }
  const lines = glyphLines(mark)
  const pitch = fontSize * LINE_HEIGHT
  if (curve === 0) {
    for (const [index, line] of lines.entries()) {
      const y = (index - (lines.length - 1) / 2) * pitch
      drawStraightLine(ctx, line, y, spacing, fontSize, contrast, effect)
    }
    return
  }
  const sign = curve > 0 ? 1 : -1
  const angle = Math.abs(curve) * Math.PI
  const baseRadius = (probeRunWidth(ctx, mark, spacing) * (fontSize / PROBE_FONT_SIZE)) / angle
  for (const [index, line] of lines.entries()) {
    const radius = baseRadius + (index - (lines.length - 1) / 2) * pitch * sign
    drawArcLine(ctx, line, Math.max(radius, 1), sign, spacing, fontSize, contrast, effect)
  }
}

/** Draws a rectangle, rounded rectangle, ellipse or line filling the mark box. */
function drawShape(
  ctx: Canvas2D,
  spec: Extract<WatermarkSpec, { kind: 'shape' }>,
  geometry: MarkGeometry,
  contrast: ResolvedContrast,
): void {
  const halfWidth = geometry.width / 2
  const halfHeight = geometry.height / 2
  const shorter = Math.min(geometry.width, geometry.height)
  const path = new Path2D()
  const shape: Shape = spec.shape
  if (shape === 'ellipse') {
    path.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2)
  } else if (shape === 'rectangle') {
    path.rect(-halfWidth, -halfHeight, geometry.width, geometry.height)
  } else {
    // Rounded rectangle and line (a very rounded, thin rectangle).
    const radius = shape === 'line' ? halfHeight : shorter * SHAPE_CORNER_RATIO
    path.roundRect(-halfWidth, -halfHeight, geometry.width, geometry.height, radius)
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
    ctx.lineWidth = geometry.height * spec.stroke.width
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
      if (spec.kind === 'symbol' && spec.symbol.type === 'icon') {
        drawIcon(ctx, mark, geometry.width, contrast)
      } else {
        drawGlyphs(ctx, mark, geometry.width, contrast)
      }
    }
  }
  ctx.restore()
}
