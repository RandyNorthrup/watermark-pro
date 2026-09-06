/**
 * Live preview for the designer and the editor: applies a spec to a subject
 * photo through the engine worker and hands back an object URL. Fonts, icon
 * paths and logo bitmaps are resolved here so callers only deal in specs.
 *
 * The subject is kept at display resolution for fast re-renders; `exportFull`
 * re-decodes the original file so downloads are full size.
 */
import { createSamplePhoto } from './sample-photo'
import type { WatermarkSpec } from '../../shared/watermark'
import type { EncodeOptions } from '../engine/encode'
import type { Size } from '../engine/layout'
import type { ApplyResult, Transform } from '../engine/pipeline'
import type { FontResource } from '../engine/protocol'
import { type ApplyInput, WatermarkWorker } from '../engine/worker-client'
import { loadFont } from '../fonts/load'
import { iconPath } from '../symbols/catalogue'

/** Preview subjects are downscaled to keep re-renders under a frame or two. */
const PREVIEW_MAX_SIDE = 1280
const PREVIEW_OUTPUT: EncodeOptions = { format: 'image/jpeg', quality: 0.86 }
/** Glyph symbols render at regular weight. */
const GLYPH_WEIGHT = 400

export interface PreviewResult {
  url: string
  width: number
  height: number
  placement: ApplyResult['placement']
  contrast: ApplyResult['contrast']
}

export interface RenderOptions {
  /** Crop and resize in source pixels; scaled to the preview automatically. */
  transform?: Transform | undefined
}

export type LogoLoader = (assetId: string) => Promise<Blob>

async function fontsFor(spec: WatermarkSpec): Promise<FontResource[]> {
  if (spec.kind === 'text') {
    return [await loadFont(spec.fontFamily, spec.fontWeight)]
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'glyph') {
    return [await loadFont(spec.symbol.fontFamily, GLYPH_WEIGHT)]
  }
  return []
}

function fitWithin(size: Size, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height))
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/** Scales a source-pixel transform to a subject drawn at `scale`. */
export function scaleTransform(
  transform: Transform | undefined,
  scale: number,
): Transform | undefined {
  if (transform === undefined || scale === 1) {
    return transform
  }
  const scaled: Transform = {}
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

function drawScaled(bitmap: ImageBitmap, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('2D canvas context is unavailable')
  }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  return canvas
}

export class PreviewRenderer {
  readonly #worker: WatermarkWorker
  readonly #loadLogo: LogoLoader
  readonly #logos = new Map<string, Blob>()
  #subject: OffscreenCanvas | null = null
  #original: Blob | null = null
  #sourceSize: Size | null = null
  #sequence = 0

  constructor(loadLogo: LogoLoader, worker = new WatermarkWorker()) {
    this.#loadLogo = loadLogo
    this.#worker = worker
  }

  async #logoBitmap(assetId: string): Promise<ImageBitmap> {
    let blob = this.#logos.get(assetId)
    if (blob === undefined) {
      blob = await this.#loadLogo(assetId)
      this.#logos.set(assetId, blob)
    }
    return await createImageBitmap(blob)
  }

  async #resources(spec: WatermarkSpec): Promise<Omit<ApplyInput, 'source' | 'output'>> {
    const [fonts, image] = await Promise.all([
      fontsFor(spec),
      spec.kind === 'image' ? this.#logoBitmap(spec.assetId) : Promise.resolve(undefined),
    ])
    return {
      spec,
      fonts,
      ...(image !== undefined && { image }),
      ...(spec.kind === 'symbol' &&
        spec.symbol.type === 'icon' && { iconPath: iconPath(spec.symbol.name) }),
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

  /** Replaces the subject photo; `null` restores the built-in sample. */
  async setSubject(file: Blob | null): Promise<void> {
    const bitmap = file === null ? await createSamplePhoto() : await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    this.#subject = drawScaled(bitmap, fitWithin(size, PREVIEW_MAX_SIDE))
    bitmap.close()
    this.#sourceSize = size
    this.#original = file
  }

  /** Forget a cached logo, for example after it was replaced. */
  forgetLogo(assetId: string): void {
    this.#logos.delete(assetId)
  }

  /**
   * Renders `spec` over the current subject. Returns `null` when a newer
   * render was requested before this one finished, so callers can ignore
   * stale frames without their own bookkeeping.
   */
  async render(spec: WatermarkSpec, options: RenderOptions = {}): Promise<PreviewResult | null> {
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
      this.#resources(spec),
      createImageBitmap(subject),
    ])
    const transform = scaleTransform(options.transform, this.subjectScale)
    const output = await this.#worker.apply({
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
      placement: output.placement,
      contrast: output.contrast,
    }
  }

  /**
   * Full-resolution render of the original photo (or the sample scene when
   * none was chosen) for download.
   */
  async exportFull(
    spec: WatermarkSpec,
    output: EncodeOptions,
    transform?: Transform,
  ): Promise<Blob> {
    const source =
      this.#original === null ? await createSamplePhoto() : await createImageBitmap(this.#original)
    const resources = await this.#resources(spec)
    const result = await this.#worker.apply({
      ...resources,
      source,
      output,
      ...(transform !== undefined && { transform }),
    })
    return result.blob
  }

  dispose(): void {
    this.#worker.terminate()
    this.#logos.clear()
  }
}
