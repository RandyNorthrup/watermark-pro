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
import { type PhotoContext, specForPhoto } from './spec-tokens'
import type { PhotoMetadata } from '../../shared/metadata'
import type { WatermarkSpec } from '../../shared/watermark'
import type { CanvasBackend, EngineCanvas } from '../engine/canvas'
import type { EncodeOptions } from '../engine/encode'
import type { WatermarkEngine } from '../engine/engine'
import type { Size } from '../engine/layout'
import type { RawMetadata } from '../engine/metadata/segments'
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
  /** Snapshot used for this frame, so live controls need not wait for worker geometry. */
  specs?: readonly WatermarkSpec[]
}

/** One spec or several, in drawing order. */
export type SpecInput = WatermarkSpec | readonly WatermarkSpec[]

function specList(input: SpecInput): readonly WatermarkSpec[] {
  return 'kind' in input ? [input] : input
}

export interface RenderOptions {
  /** Crop and resize in source pixels; scaled to the preview automatically. */
  transform?: Transform | undefined
  /** Final output size for `{width}` / `{height}` tokens; the source size otherwise. */
  output?: Size | undefined
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
  #metadata: PhotoMetadata | null = null
  #sourceSize: Size | null = null
  #sampleSubject: Promise<void> | null = null
  #sequence = 0
  #subjectRequest = 0
  #disposed = false

  constructor(
    loadLogo: LogoLoader,
    engine: WatermarkEngine = createEngine(),
    backend: CanvasBackend = mainThreadBackend(),
  ) {
    this.#resources = new MarkResources(loadLogo)
    this.#engine = engine
    this.#backend = backend
  }

  /** The marks the engine should draw for the current subject, tokens filled. */
  #marksFor(input: SpecInput, output?: Size): readonly WatermarkSpec[] {
    const context: PhotoContext = {
      metadata: this.#metadata,
      ...(output !== undefined && { output }),
    }
    return specList(input).map((spec) => specForPhoto(spec, this.#original, context))
  }

  /** The raw metadata bytes the engine writes back, or null for a photo with none. */
  #rawMetadata(): RawMetadata | null {
    const meta = this.#metadata
    return meta === null ? null : { exif: meta.exif, xmp: meta.xmp, density: meta.density }
  }

  /** A stable seed for random placement: the photo's, or 1 for the sample. */
  #seed(): number {
    return this.#original === null ? 1 : seedFor(this.#original)
  }

  /** The photo itself, or the sample scene when there is none. */
  #decode(file: File | null): Promise<ImageBitmap> {
    return file === null ? createSamplePhoto() : createImageBitmap(file)
  }

  /** Share the first sample decode so concurrent renders keep latest-frame ordering. */
  async #ensureSampleSubject(): Promise<void> {
    if (this.#subject !== null) return
    const pending = this.#sampleSubject ?? this.setSubject(null)
    this.#sampleSubject = pending
    try {
      await pending
    } finally {
      if (this.#sampleSubject === pending) this.#sampleSubject = null
    }
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

  /** Replaces the subject photo; `null` restores the built-in sample. Metadata fills tokens and export policy. */
  async setSubject(file: File | null, metadata: PhotoMetadata | null = null): Promise<void> {
    this.#subjectRequest += 1
    const request = this.#subjectRequest
    this.#sequence += 1
    const bitmap = await this.#decode(file)
    if (this.#disposed || request !== this.#subjectRequest) {
      bitmap.close()
      return
    }
    const size = { width: bitmap.width, height: bitmap.height }
    this.#subject = drawScaled(bitmap, fitWithin(size, PREVIEW_MAX_SIDE), this.#backend)
    bitmap.close()
    this.#sourceSize = size
    this.#original = file
    this.#metadata = metadata
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
      await this.#ensureSampleSubject()
    }
    const subject = this.#subject
    if (subject === null) {
      // A newer subject request superseded this sample decode. Its render will
      // publish the next frame, so this stale frame has no result to expose.
      return null
    }
    this.#sequence += 1
    const ticket = this.#sequence
    const [resources, source] = await Promise.all([
      this.#resources.resolve(this.#marksFor(input, options.output), this.#seed()),
      subject.toBitmap(),
    ])
    const transform = scaleTransform(options.transform, this.subjectScale)
    const output = await this.#engine.apply({
      ...resources,
      source,
      output: PREVIEW_OUTPUT,
      ...(transform !== undefined && { transform }),
    })
    if (this.#disposed || ticket !== this.#sequence) {
      return null
    }
    return {
      url: URL.createObjectURL(output.blob),
      width: output.width,
      height: output.height,
      marks: output.marks,
      specs: specList(input),
    }
  }

  /**
   * Full-resolution render of the original photo (or the sample scene when
   * none was chosen) for download.
   */
  async exportFull(
    input: SpecInput,
    output: EncodeOptions,
    transform?: Transform,
    tokenOutput?: Size,
  ): Promise<Blob> {
    const source = await this.#decode(this.#original)
    const resources = await this.#resources.resolve(
      this.#marksFor(input, tokenOutput),
      this.#seed(),
    )
    const metadata = this.#rawMetadata()
    const result = await this.#engine.apply({
      ...resources,
      source,
      output,
      ...(transform !== undefined && { transform }),
      ...(metadata !== null && { metadata }),
    })
    return result.blob
  }

  dispose(): void {
    this.#disposed = true
    this.#sequence += 1
    this.#subjectRequest += 1
    this.#engine.terminate()
    this.#resources.clear()
  }
}
