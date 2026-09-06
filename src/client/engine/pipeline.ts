/**
 * End-to-end application of a mark to one image: optional crop and resize,
 * analysis, placement, contrast, drawing (single or tiled), and encoding.
 * Runs in a Web Worker via `worker.ts` and in the editor on the main thread.
 */
import { type LuminanceMap, toLuminanceMap } from './analysis'
import { resolveContrast, type ResolvedContrast } from './contrast'
import { encodeCanvas, type EncodeOptions } from './encode'
import { markSize, resolvePlacement, type Size, tileCentres } from './layout'
import { type Canvas2D, drawMark, measureAspect, type RenderableMark } from './render'
import type { Anchor } from '../../shared/watermark'

/** Longest side of the analysis map; small enough to be instant, large enough to see composition. */
export const ANALYSIS_MAX_SIDE = 256

/** Pixel rectangle of the source to keep; omitted means the whole image. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Transform {
  crop?: CropRect
  /** Output size after cropping; aspect is not preserved automatically. */
  resize?: Size
}

export interface ApplyRequest {
  source: ImageBitmap
  mark: RenderableMark
  output: EncodeOptions
  transform?: Transform
}

export interface ApplyResult {
  blob: Blob
  width: number
  height: number
  placement: { centreX: number; centreY: number; anchor: Anchor | null }
  contrast: ResolvedContrast
}

export function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
}

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('2D canvas context is unavailable')
  }
  return ctx
}

/** Draws the (cropped, resized) source onto a fresh canvas. */
export function prepareCanvas(
  source: ImageBitmap,
  transform: Transform | undefined,
): OffscreenCanvas {
  const crop = transform?.crop ?? { x: 0, y: 0, width: source.width, height: source.height }
  if (crop.width <= 0 || crop.height <= 0) {
    throw new RangeError('crop rectangle must have a positive size')
  }
  const size = transform?.resize ?? { width: crop.width, height: crop.height }
  const canvas = createCanvas(size.width, size.height)
  context(canvas).drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas
}

/** Luminance map of a canvas at analysis resolution. */
export function analyseCanvas(canvas: OffscreenCanvas): LuminanceMap {
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(canvas.width, canvas.height))
  const small = createCanvas(canvas.width * scale, canvas.height * scale)
  const ctx = context(small)
  ctx.drawImage(canvas, 0, 0, small.width, small.height)
  const pixels = ctx.getImageData(0, 0, small.width, small.height)
  return toLuminanceMap(pixels.data, pixels.width, pixels.height)
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
): Pick<ApplyResult, 'placement' | 'contrast'> {
  const { spec } = mark
  const size = markSize(spec, image, measureAspect(ctx, mark))
  const placement = resolvePlacement(spec, image, size, map)
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
    placement: { centreX: placement.centreX, centreY: placement.centreY, anchor: placement.anchor },
    contrast,
  }
}

export async function applyWatermark(request: ApplyRequest): Promise<ApplyResult> {
  const canvas = prepareCanvas(request.source, request.transform)
  const map = analyseCanvas(canvas)
  const composed = composeMark(context(canvas), canvas, map, request.mark)
  const blob = await encodeCanvas(canvas, request.output)
  return { blob, width: canvas.width, height: canvas.height, ...composed }
}
