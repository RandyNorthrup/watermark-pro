/**
 * End-to-end application of a mark to one image: optional crop and resize,
 * analysis, placement, contrast, drawing (single or tiled), and encoding.
 * Runs in a Web Worker via `worker.ts` and, where the worker cannot draw,
 * on the main thread via `local-engine.ts`; the caller supplies the canvas
 * backend for its context.
 */
import { adjustPixels } from './adjust'
import {
  LUMA_BLUE,
  LUMA_GREEN,
  LUMA_RED,
  type LuminanceMap,
  MAX_CHANNEL,
  read,
  toLuminanceMap,
} from './analysis'
import type { Canvas2D, CanvasBackend, EngineCanvas } from './canvas'
import { resolveContrast, type ResolvedContrast } from './contrast'
import { DEFAULT_METADATA_POLICY, encodeCanvas, type EncodeOptions } from './encode'
import { embedInvisibleMark } from './invisible'
import { markSize, resolvePlacement, type Size, tileCentres } from './layout'
import { withAssetNotice } from './metadata/asset-notice'
import type { RawMetadata } from './metadata/segments'
import { withMetadata } from './metadata/write'
import {
  chain,
  type Matrix,
  orientedFrame,
  scaleMatrix,
  sourceToOriented,
  translate,
} from './orient'
import { drawMark, measureAspect, type RenderableMark } from './render'
import {
  type Adjustments,
  IDENTITY_ORIENTATION,
  isIdentityAdjustments,
  type Orientation,
} from '../../shared/adjustments'
import { artworkLicenseNotice } from '../../shared/asset-licenses'
import type { Anchor } from '../../shared/watermark'

/** Longest side of the analysis map; small enough to be instant, large enough to see composition. */
export const ANALYSIS_MAX_SIDE = 256
/** RGBA bytes per pixel. */
const CHANNELS = 4

/** Pixel rectangle of the source to keep; omitted means the whole image. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Transform {
  /** Quarter turns, flips and straighten, applied before the crop. */
  orientation?: Orientation
  /** Crop in oriented-and-straightened pixel space; omitted means the whole frame. */
  crop?: CropRect
  /** Output size after cropping; aspect is not preserved automatically. */
  resize?: Size
  /** Colour adjustments applied after cropping and resizing. */
  adjust?: Adjustments
  /** An outer frame drawn around the finished photo, after the marks. */
  border?: Border
}

/** A matte frame around the photo; width is a fraction of the shorter output side. */
export interface Border {
  width: number
  colour: string
}

/** The frame width may not exceed this fraction of the shorter output side. */
export const MAX_BORDER_RATIO = 0.1

export interface ApplyRequest {
  source: ImageBitmap
  /** Drawn in order; later marks paint over earlier ones. */
  marks: RenderableMark[]
  output: EncodeOptions
  transform?: Transform
  /** Source metadata to write back per `output.metadata`; null strips everything. */
  metadata?: RawMetadata | null
}

/** Where the (single, untiled) mark landed, in output pixels; the editor draws its handles from this. */
export interface MarkPlacement {
  centreX: number
  centreY: number
  anchor: Anchor | null
  width: number
  height: number
  rotation: number
}

/** Where one mark landed and which ink it got. */
export interface MarkOutcome {
  placement: MarkPlacement
  contrast: ResolvedContrast
}

export interface ApplyResult {
  blob: Blob
  width: number
  height: number
  /** One entry per mark, in the order they were given. */
  marks: MarkOutcome[]
}

interface OutputGeometry {
  crop: CropRect
  size: Size
  /** Source pixels → oriented-and-straightened frame pixels. */
  matrix: Matrix
}

/** Crop, output size and the source-to-frame affine for a transform. */
function outputGeometry(source: Size, transform: Transform | undefined): OutputGeometry {
  const orientation = transform?.orientation ?? IDENTITY_ORIENTATION
  const frame = orientedFrame(source, orientation)
  // Floor the default crop so the sampled region stays inside the straightened
  // rectangle (no empty corners) and the canvas gets integer dimensions.
  const crop = transform?.crop ?? {
    x: 0,
    y: 0,
    width: Math.max(1, Math.floor(frame.width)),
    height: Math.max(1, Math.floor(frame.height)),
  }
  if (crop.width <= 0 || crop.height <= 0) {
    throw new RangeError('crop rectangle must have a positive size')
  }
  const size = transform?.resize ?? { width: crop.width, height: crop.height }
  return { crop, size, matrix: sourceToOriented(source, orientation) }
}

/** Draws the whole source through `matrix` onto `canvas`, which clips to the kept region. */
function drawSource(canvas: EngineCanvas, source: ImageBitmap, geometry: OutputGeometry): void {
  const scale = scaleMatrix(
    canvas.width / geometry.crop.width,
    canvas.height / geometry.crop.height,
  )
  const full = chain([geometry.matrix, translate(-geometry.crop.x, -geometry.crop.y), scale])
  const ctx = canvas.context
  ctx.save()
  ctx.setTransform(full.a, full.b, full.c, full.d, full.e, full.f)
  ctx.drawImage(source, 0, 0)
  ctx.restore()
}

/** Draws the oriented, cropped and resized source onto a fresh canvas. */
export function prepareCanvas(
  source: ImageBitmap,
  transform: Transform | undefined,
  backend: CanvasBackend,
): EngineCanvas {
  const geometry = outputGeometry(source, transform)
  const canvas = backend.createCanvas(geometry.size.width, geometry.size.height)
  drawSource(canvas, source, geometry)
  return canvas
}

/**
 * Luminance map of the oriented, cropped source at analysis resolution.
 * Samples the source bitmap directly (no adjustments), so no canvas ever
 * serves as an image source.
 */
export function analyseSource(
  source: ImageBitmap,
  transform: Transform | undefined,
  backend: CanvasBackend,
): LuminanceMap {
  const geometry = outputGeometry(source, transform)
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(geometry.size.width, geometry.size.height))
  const width = Math.max(1, Math.round(geometry.size.width * scale))
  const height = Math.max(1, Math.round(geometry.size.height * scale))
  const small = backend.createCanvas(width, height)
  drawSource(small, source, geometry)
  const pixels = small.context.getImageData(0, 0, width, height)
  return toLuminanceMap(pixels.data, width, height)
}

/**
 * Luminance map of already-drawn (adjusted) pixels, box-averaged down to the
 * analysis resolution, so a mark placed on an adjusted photo reads the tones
 * it will actually sit on.
 */
export function analysePixels(image: ImageData): LuminanceMap {
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  if (width === image.width && height === image.height) {
    return toLuminanceMap(image.data, width, height)
  }
  const values = new Float32Array(width * height)
  const counts = new Uint32Array(width * height)
  const data = image.data
  for (let sourceY = 0; sourceY < image.height; sourceY += 1) {
    const targetY = Math.min(height - 1, Math.floor((sourceY * height) / image.height))
    for (let sourceX = 0; sourceX < image.width; sourceX += 1) {
      const targetX = Math.min(width - 1, Math.floor((sourceX * width) / image.width))
      const source = (sourceY * image.width + sourceX) * CHANNELS
      const luma =
        (LUMA_RED * read(data, source) +
          LUMA_GREEN * read(data, source + 1) +
          LUMA_BLUE * read(data, source + 2)) /
        MAX_CHANNEL
      const target = targetY * width + targetX
      values[target] = read(values, target) + luma
      counts[target] = read(counts, target) + 1
    }
  }
  // Every target cell receives at least one source pixel (downsampling only).
  for (let index = 0; index < values.length; index += 1) {
    values[index] = read(values, index) / read(counts, index)
  }
  return { width, height, values }
}

/**
 * Draws the mark (single or tiled) onto an already prepared canvas and
 * reports where it went. Shared by the worker pipeline and the live preview.
 */
export function composeMark(
  ctx: Canvas2D,
  image: Size,
  map: LuminanceMap,
  mark: RenderableMark,
): MarkOutcome {
  const { spec } = mark
  const size = markSize(spec, image, measureAspect(ctx, mark))
  const placement = resolvePlacement(spec, image, size, map, mark.seed)
  const contrast = resolveContrast(spec.contrast, placement.meanLuminance)
  const rotation = spec.style.rotation
  if (spec.style.tiling.enabled) {
    for (const centre of tileCentres(image, size, spec.style.tiling.spacing)) {
      drawMark(ctx, mark, { ...size, centreX: centre.x, centreY: centre.y, rotation }, contrast)
    }
  } else {
    drawMark(
      ctx,
      mark,
      { ...size, centreX: placement.centreX, centreY: placement.centreY, rotation },
      contrast,
    )
  }
  return {
    placement: {
      centreX: placement.centreX,
      centreY: placement.centreY,
      anchor: placement.anchor,
      width: size.width,
      height: size.height,
      rotation,
    },
    contrast,
  }
}

export async function applyWatermark(
  request: ApplyRequest,
  backend: CanvasBackend,
): Promise<ApplyResult> {
  const canvas = prepareCanvas(request.source, request.transform, backend)
  const adjust = request.transform?.adjust
  const map = applyAdjustments(canvas, adjust, request.source, request.transform, backend)
  // Every mark is placed against the photo alone: marks do not avoid each
  // other, and a later mark paints over an earlier one where they meet.
  const marks = request.marks.map((mark) => composeMark(canvas.context, canvas, map, mark))
  const framed = await frameCanvas(canvas, request.transform?.border, backend)
  embedInvisible(framed.canvas, request.output.invisible)
  const encoded = await encodeCanvas(framed.canvas, request.output)
  const metadataBlob = await withMetadata(
    encoded,
    request.output.format,
    request.metadata ?? null,
    request.output.metadata ?? DEFAULT_METADATA_POLICY,
    { width: framed.canvas.width, height: framed.canvas.height },
  )
  const blob = await withAssetNotice(
    metadataBlob,
    request.output.format,
    artworkLicenseNotice(request.marks.map((mark) => mark.spec)),
    { width: framed.canvas.width, height: framed.canvas.height },
  )
  const offsetMarks = marks.map((mark) => ({
    ...mark,
    placement: {
      ...mark.placement,
      centreX: mark.placement.centreX + framed.offset,
      centreY: mark.placement.centreY + framed.offset,
    },
  }))
  return { blob, width: framed.canvas.width, height: framed.canvas.height, marks: offsetMarks }
}

/** Draws a matte frame around the photo canvas, or returns it unchanged. */
async function frameCanvas(
  photo: EngineCanvas,
  border: Border | undefined,
  backend: CanvasBackend,
): Promise<{ canvas: EngineCanvas; offset: number }> {
  if (border === undefined || border.width <= 0) {
    return { canvas: photo, offset: 0 }
  }
  const offset = Math.round(border.width * Math.min(photo.width, photo.height))
  if (offset <= 0) {
    return { canvas: photo, offset: 0 }
  }
  const canvas = backend.createCanvas(photo.width + offset * 2, photo.height + offset * 2)
  const ctx = canvas.context
  ctx.fillStyle = border.colour
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const bitmap = await photo.toBitmap()
  ctx.drawImage(bitmap, offset, offset)
  bitmap.close()
  return { canvas, offset }
}

/**
 * Applies colour adjustments to the prepared canvas in place and returns the
 * luminance map placement should use: the adjusted pixels when there are
 * adjustments, the source bitmap otherwise (the fast path).
 */
function applyAdjustments(
  canvas: EngineCanvas,
  adjust: Adjustments | undefined,
  source: ImageBitmap,
  transform: Transform | undefined,
  backend: CanvasBackend,
): LuminanceMap {
  if (adjust === undefined || isIdentityAdjustments(adjust)) {
    return analyseSource(source, transform, backend)
  }
  const ctx = canvas.context
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  adjustPixels(image.data, canvas.width, canvas.height, adjust)
  ctx.putImageData(image, 0, 0)
  return analysePixels(image)
}

/**
 * Embeds the hidden message (M15) into the framed pixels before encoding.
 * PNG-only — `encodeCanvas` rejects a lossy format, so the LSB payload never
 * rides a re-compression that would destroy it. Mirrors `applyAdjustments`.
 */
function embedInvisible(canvas: EngineCanvas, invisible: EncodeOptions['invisible']): void {
  if (invisible === undefined) {
    return
  }
  const ctx = canvas.context
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  embedInvisibleMark(image.data, canvas.width, canvas.height, invisible.message)
  ctx.putImageData(image, 0, 0)
}
