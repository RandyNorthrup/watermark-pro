/**
 * Rasterises the chosen layers onto a transparent, page-sized canvas so they
 * can be stamped onto a PDF page. Browser-only: it draws on an
 * capability-selected canvas through the engine's `composeMark`, sharing the
 * photo tool's DOM fallback when OffscreenCanvas is unavailable. Its pure decisions (pixel
 * sizing, the smart-placement fallback) live in `raster-layout.ts`. Native
 * `raster.browser.test.ts` tests exercise this drawing code with V8 coverage.
 */
import { documentSpec, type PageSize, pixelDimensions } from './raster-layout'
import type { WatermarkSpec } from '../../shared/watermark'
import type { LuminanceMap } from '../engine/analysis'
import { FontLoader } from '../engine/fonts'
import { composeMark } from '../engine/pipeline'
import type { MarkInput } from '../engine/protocol'
import { mainThreadBackend } from '../lib/canvas-backend'
import { type LogoLoader, MarkResources } from '../lib/mark-resources'

/**
 * A blank page reads as flat white, so auto contrast resolves to dark ink and
 * placement has no busy region to find. A 1×1 map is enough: every sample of a
 * uniform field returns the same value.
 */
const WHITE_PAGE_MAP: LuminanceMap = { width: 1, height: 1, values: Float32Array.of(1) }

/**
 * Resolves the chosen presets to drawable marks once, then rasterises them for
 * each distinct page size a document needs. Holds the logo bitmaps for the life
 * of a batch; `close` releases them.
 */
export class DocumentRasteriser {
  readonly #resources: MarkResources
  readonly #fonts: FontLoader
  #marks: MarkInput[] = []

  constructor(loadLogo: LogoLoader, fonts: FontFaceSet = document.fonts) {
    this.#resources = new MarkResources(loadLogo)
    this.#fonts = new FontLoader(fonts)
  }

  /** Resolves the layers to marks and loads their fonts; call once before rasterising. */
  async prepare(specs: readonly WatermarkSpec[]): Promise<void> {
    const resolved = await this.#resources.resolve(specs)
    await this.#fonts.ensure(resolved.fonts)
    this.#marks = resolved.marks
  }

  /** Transparent PNG bytes of the prepared marks drawn at `page`'s size. */
  async rasterise(page: PageSize): Promise<Uint8Array> {
    const pixels = pixelDimensions(page)
    const canvas = mainThreadBackend().createCanvas(pixels.width, pixels.height)
    for (const mark of this.#marks) {
      composeMark(canvas.context, pixels, WHITE_PAGE_MAP, {
        ...mark,
        spec: documentSpec(mark.spec),
      })
    }
    const blob = await canvas.encode({ format: 'image/png', quality: 1, metadata: 'strip' })
    return new Uint8Array(await blob.arrayBuffer())
  }

  /** Releases the resolved logo bitmaps and cached blobs. */
  close(): void {
    for (const mark of this.#marks) {
      mark.image?.close()
    }
    this.#marks = []
    this.#resources.clear()
  }
}
