/**
 * Live preview for the designer and the editor: applies a spec to a subject
 * photo through the watermark engine and hands back an object URL. Fonts, icon
 * paths and logo bitmaps are resolved here so callers only deal in specs.
 *
 * The subject is kept at display resolution for fast re-renders; `exportFull`
 * re-decodes the original file so downloads are full size.
 */
import { createEngine, mainThreadBackend } from './canvas-backend'
import { type LogoLoader, MarkResources } from './mark-resources'
import { createSamplePhoto } from './sample-photo'
import { specForPhoto } from './spec-tokens'
import type { WatermarkSpec } from '../../shared/watermark'
import type { CanvasBackend, EngineCanvas } from '../engine/canvas'
import type { EncodeOptions } from '../engine/encode'
import type { WatermarkEngine } from '../engine/engine'
import type { Size } from '../engine/layout'
import type { MarkOutcome, Transform } from '../engine/pipeline'
import { seedFor } from '../engine/random'

/** Preview subjects are downscaled to keep re-renders under a frame or two. */
const PREVIEW_MAX_SIDE = 1280
const PREVIEW_OUTPUT: EncodeOptions = { format: 'image/jpeg', quality: 0.86 }

export interface PreviewResult {
  url: string
  width: number
  height: number
  /** One entry per rendered mark, in order; empty when nothing was drawn. */
  marks: MarkOutcome[]
}

/** One spec or several, in drawing order. */
export type SpecInput = WatermarkSpec | readonly WatermarkSpec[]

function specList(input: SpecInput): readonly WatermarkSpec[] {
  return 'kind' in input ? [input] : input
}

export interface RenderOptions {
  /** Crop and resize in source pixels; scaled to the preview automatically. */
  transform?: Transform | undefined
}

export type { LogoLoader } from './mark-resources'

function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height))
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * Scales a transform to a subject drawn at `scale`. Orientation and colour
 * adjustments are scale-free and pass through unchanged; only the crop and
 * the explicit resize follow the subject's pixel scale.
 */
export function scaleTransform(
  transform: Transform | undefined,
  scale: number,
): Transform | undefined {
  if (transform === undefined || scale === 1) {
    return transform
  }
  const scaled: Transform = {}
  if (transform.orientation !== undefined) {
    scaled.orientation = transform.orientation
  }
  if (transform.adjust !== undefined) {
    scaled.adjust = transform.adjust
  }
  if (transform.border !== undefined) {
    scaled.border = transform.border
  }
  if (transform.crop !== undefined) {
    scaled.crop = {
      x: transform.crop.x * scale,
      y: transform.crop.y * scale,
      width: Math.max(1, transform.crop.width * scale),
      height: Math.max(1, transform.crop.height * scale),
    }
  }
  if (transform.resize !== undefined) {
    scaled.resize = {
      width: Math.max(1, Math.round(transform.resize.width * scale)),
      height: Math.max(1, Math.round(transform.resize.height * scale)),
    }
  }
  return scaled
}

function drawScaled(bitmap: ImageBitmap, size: Size, backend: CanvasBackend): EngineCanvas {
  const canvas = backend.createCanvas(size.width, size.height)
  canvas.context.drawImage(bitmap, 0, 0, size.width, size.height)
  return canvas
}

export class PreviewRenderer {
  readonly #engine: WatermarkEngine
  readonly #backend: CanvasBackend
  readonly #resources: MarkResources
  #subject: EngineCanvas | null = null
  #original: File | null = null
  #sourceSize: Size | null = null
  #sequence = 0

  constructor(
    loadLogo: LogoLoader,
    engine: WatermarkEngine = createEngine(),
    backend: CanvasBackend = mainThreadBackend(),
  ) {
    this.#resources = new MarkResources(loadLogo)
    this.#engine = engine
    this.#backend = backend
  }

  /** The marks the engine should draw for the current subject. */
  #marksFor(input: SpecInput): readonly WatermarkSpec[] {
    return specList(input).map((spec) => specForPhoto(spec, this.#original))
  }

  /** A stable seed for random placement: the photo's, or 1 for the sample. */
  #seed(): number {
    return this.#original === null ? 1 : seedFor(this.#original)
  }

  /** The photo itself, or the sample scene when there is none. */
  #decode(file: File | null): Promise<ImageBitmap> {
    return file === null ? createSamplePhoto(this.#backend) : createImageBitmap(file)
  }

  /** Pixel size of the photo the preview stands for (the sample scene by default). */
  get sourceSize(): Size | null {
    return this.#sourceSize
  }

  /** Preview pixels per source pixel. */
  get subjectScale(): number {
    if (this.#subject === null || this.#sourceSize === null) {
      return 1
    }
    return this.#subject.width / this.#sourceSize.width
  }

  /** Replaces the subject photo; `null` restores the built-in sample. */
  async setSubject(file: File | null): Promise<void> {
    const bitmap = await this.#decode(file)
    const size = { width: bitmap.width, height: bitmap.height }
    this.#subject = drawScaled(bitmap, fitWithin(size, PREVIEW_MAX_SIDE), this.#backend)
    bitmap.close()
    this.#sourceSize = size
    this.#original = file
  }

  /** Forget a cached logo, for example after it was replaced. */
  forgetLogo(assetId: string): void {
    this.#resources.forget(assetId)
  }

  /**
   * Renders the marks over the current subject. Returns `null` when a newer
   * render was requested before this one finished, so callers can ignore
   * stale frames without their own bookkeeping.
   */
  async render(input: SpecInput, options: RenderOptions = {}): Promise<PreviewResult | null> {
    if (this.#subject === null) {
      await this.setSubject(null)
    }
    const subject = this.#subject
    if (subject === null) {
      throw new Error('preview subject missing after initialisation')
    }
    this.#sequence += 1
    const ticket = this.#sequence
    const [resources, source] = await Promise.all([
      this.#resources.resolve(this.#marksFor(input), this.#seed()),
      subject.toBitmap(),
    ])
    const transform = scaleTransform(options.transform, this.subjectScale)
    const output = await this.#engine.apply({
      ...resources,
      source,
      output: PREVIEW_OUTPUT,
      ...(transform !== undefined && { transform }),
    })
    if (ticket !== this.#sequence) {
      return null
    }
    return {
      url: URL.createObjectURL(output.blob),
      width: output.width,
      height: output.height,
      marks: output.marks,
    }
  }

  /**
   * Full-resolution render of the original photo (or the sample scene when
   * none was chosen) for download.
   */
  async exportFull(input: SpecInput, output: EncodeOptions, transform?: Transform): Promise<Blob> {
    const source = await this.#decode(this.#original)
    const resources = await this.#resources.resolve(this.#marksFor(input), this.#seed())
    const result = await this.#engine.apply({
      ...resources,
      source,
      output,
      ...(transform !== undefined && { transform }),
    })
    return result.blob
  }

  dispose(): void {
    this.#engine.terminate()
    this.#resources.clear()
  }
}
