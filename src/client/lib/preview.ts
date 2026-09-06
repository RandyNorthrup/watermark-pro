/**
 * Live preview for the designer: applies a spec to a subject photo through
 * the engine worker and hands back an object URL. Fonts, icon paths and logo
 * bitmaps are resolved here so the designer only deals in specs.
 */
import { createSamplePhoto } from './sample-photo'
import type { WatermarkSpec } from '../../shared/watermark'
import type { EncodeOptions } from '../engine/encode'
import type { FontResource } from '../engine/protocol'
import { WatermarkWorker } from '../engine/worker-client'
import type { ApplyOutput } from '../engine/worker-client'
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
  placement: ApplyOutput['placement']
  contrast: ApplyOutput['contrast']
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

function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export class PreviewRenderer {
  readonly #worker: WatermarkWorker
  readonly #loadLogo: LogoLoader
  readonly #logos = new Map<string, Blob>()
  #subject: OffscreenCanvas | null = null
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

  /** Replaces the subject photo; `null` restores the built-in sample. */
  async setSubject(file: Blob | null): Promise<void> {
    const bitmap = file === null ? await createSamplePhoto() : await createImageBitmap(file)
    const size = fitWithin(bitmap.width, bitmap.height, PREVIEW_MAX_SIDE)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('2D canvas context is unavailable')
    }
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    this.#subject = canvas
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
  async render(spec: WatermarkSpec): Promise<PreviewResult | null> {
    if (this.#subject === null) {
      await this.setSubject(null)
    }
    const subject = this.#subject
    if (subject === null) {
      throw new Error('preview subject missing after initialisation')
    }
    this.#sequence += 1
    const ticket = this.#sequence
    const [fonts, source, image] = await Promise.all([
      fontsFor(spec),
      createImageBitmap(subject),
      spec.kind === 'image' ? this.#logoBitmap(spec.assetId) : Promise.resolve(undefined),
    ])
    const output = await this.#worker.apply({
      source,
      spec,
      fonts,
      output: PREVIEW_OUTPUT,
      ...(image !== undefined && { image }),
      ...(spec.kind === 'symbol' &&
        spec.symbol.type === 'icon' && { iconPath: iconPath(spec.symbol.name) }),
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

  dispose(): void {
    this.#worker.terminate()
    this.#logos.clear()
  }
}
