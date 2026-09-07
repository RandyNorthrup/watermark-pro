/**
 * End-to-end application of a mark to one image: optional crop and resize,
 * analysis, placement, contrast, drawing (single or tiled), and encoding.
 * Runs in a Web Worker via `worker.ts` and, where the worker cannot draw,
 * on the main thread via `local-engine.ts`; the caller supplies the canvas
 * backend for its context.
 */
import { type LuminanceMap, toLuminanceMap } from './analysis'
import type { Canvas2D, CanvasBackend, EngineCanvas } from './canvas'
import { resolveContrast, type ResolvedContrast } from './contrast'
import { encodeCanvas, type EncodeOptions } from './encode'
import { markSize, resolvePlacement, type Size, tileCentres } from './layout'
import { drawMark, measureAspect, type RenderableMark } from './render'
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
  /** Drawn in order; later marks paint over earlier ones. */
  marks: RenderableMark[]
  output: EncodeOptions
  transform?: Transform
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

/** The crop a transform asks for, or the whole source. */
function cropOf(source: ImageBitmap, transform: Transform | undefined): CropRect {
  const crop = transform?.crop ?? { x: 0, y: 0, width: source.width, height: source.height }
  if (crop.width <= 0 || crop.height <= 0) {
    throw new RangeError('crop rectangle must have a positive size')
  }
  return crop
}

function drawCropped(ctx: Canvas2D, source: ImageBitmap, crop: CropRect, target: Size): void {
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height)
}

/** Draws the (cropped, resized) source onto a fresh canvas. */
export function prepareCanvas(
  source: ImageBitmap,
  transform: Transform | undefined,
  backend: CanvasBackend,
): EngineCanvas {
  const crop = cropOf(source, transform)
  const size = transform?.resize ?? { width: crop.width, height: crop.height }
  const canvas = backend.createCanvas(size.width, size.height)
  drawCropped(canvas.context, source, crop, canvas)
  return canvas
}

/**
 * Luminance map of the (cropped) source at analysis resolution. Samples the
 * source bitmap rather than the prepared canvas so no canvas ever has to
 * serve as an image source, which keeps the backend interface minimal.
 */
export function analyseSource(
  source: ImageBitmap,
  transform: Transform | undefined,
  backend: CanvasBackend,
): LuminanceMap {
  const crop = cropOf(source, transform)
  const output = transform?.resize ?? { width: crop.width, height: crop.height }
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(output.width, output.height))
  const small = backend.createCanvas(output.width * scale, output.height * scale)
  drawCropped(small.context, source, crop, small)
  const pixels = small.context.getImageData(0, 0, small.width, small.height)
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
): MarkOutcome {
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
  const map = analyseSource(request.source, request.transform, backend)
  // Every mark is placed against the photo alone: marks do not avoid each
  // other, and a later mark paints over an earlier one where they meet.
  const marks = request.marks.map((mark) => composeMark(canvas.context, canvas, map, mark))
  const blob = await encodeCanvas(canvas, request.output)
  return { blob, width: canvas.width, height: canvas.height, marks }
}
