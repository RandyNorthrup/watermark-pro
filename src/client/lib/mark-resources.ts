/**
 * Resolves what a spec needs beyond the photo: font files for text and
 * glyphs, path data for icons, and a fresh logo bitmap (bitmaps are
 * transferred to the worker and closed there, so one is made per render;
 * the bytes are cached).
 */
import type { WatermarkSpec } from '../../shared/watermark'
import type { ApplyInput } from '../engine/engine'
import type { FontResource, MarkInput } from '../engine/protocol'
import { loadFont } from '../fonts/load'
import { iconPath } from '../symbols/catalogue'

/** Glyph symbols render at regular weight. */
const GLYPH_WEIGHT = 400

export type LogoLoader = (assetId: string) => Promise<Blob>

/** The marks and fonts an engine call needs, ready to spread into `ApplyInput`. */
export type MarkInputs = Pick<ApplyInput, 'marks' | 'fonts'>

async function fontsFor(spec: WatermarkSpec): Promise<FontResource[]> {
  if (spec.kind === 'text') {
    return [await loadFont(spec.fontFamily, spec.fontWeight)]
  }
  if (spec.kind === 'symbol' && spec.symbol.type === 'glyph') {
    return [await loadFont(spec.symbol.fontFamily, GLYPH_WEIGHT)]
  }
  return []
}

export class MarkResources {
  readonly #loadLogo: LogoLoader
  readonly #logos = new Map<string, Blob>()

  constructor(loadLogo: LogoLoader) {
    this.#loadLogo = loadLogo
  }

  async #logoBitmap(assetId: string): Promise<ImageBitmap> {
    let blob = this.#logos.get(assetId)
    if (blob === undefined) {
      blob = await this.#loadLogo(assetId)
      this.#logos.set(assetId, blob)
    }
    return await createImageBitmap(blob)
  }

  async #mark(spec: WatermarkSpec): Promise<{ mark: MarkInput; fonts: FontResource[] }> {
    const [fonts, image] = await Promise.all([
      fontsFor(spec),
      spec.kind === 'image' ? this.#logoBitmap(spec.assetId) : Promise.resolve(undefined),
    ])
    return {
      fonts,
      mark: {
        spec,
        ...(image !== undefined && { image }),
        ...(spec.kind === 'symbol' &&
          spec.symbol.type === 'icon' && { iconPath: iconPath(spec.symbol.name) }),
      },
    }
  }

  /** Resources for every spec, in order; each font file is listed once. */
  async resolve(specs: readonly WatermarkSpec[]): Promise<MarkInputs> {
    const resolved = await Promise.all(specs.map((spec) => this.#mark(spec)))
    const fonts = new Map<string, FontResource>()
    for (const entry of resolved) {
      for (const font of entry.fonts) {
        fonts.set(`${font.family}#${String(font.weight)}`, font)
      }
    }
    return { marks: resolved.map((entry) => entry.mark), fonts: fonts.values().toArray() }
  }

  /** Forget a cached logo, for example after it was replaced. */
  forget(assetId: string): void {
    this.#logos.delete(assetId)
  }

  clear(): void {
    this.#logos.clear()
  }
}
