import { markPng } from './pdf-fixtures'
import type { WatermarkSpec } from '../../shared/watermark'
import type { PageSize } from '../pdf/raster-layout'

/**
 * Replacement for `pdf/raster` in jsdom, where there is no `OffscreenCanvas`.
 * Records what it was asked to prepare and rasterise, and returns a valid tiny
 * PNG so the real `watermark-pdf` still embeds and draws a live image. Mirrors
 * `DocumentRasteriser`'s public shape.
 */

/** The layers of every `prepare`, in order. */
export const preparedBatches: WatermarkSpec[][] = []
/** Every page size a rasterise was asked for, across the run. */
export const rasterisedSizes: PageSize[] = []
/** When set, `prepare` rejects with it — the shared-step failure the tool reports once. */
export const fakeRasterControls: { prepareError: Error | null } = { prepareError: null }

export class DocumentRasteriser {
  static instances = 0
  static closed = 0

  constructor(_loadLogo: (assetId: string) => Promise<Blob>) {
    DocumentRasteriser.instances += 1
  }

  prepare(specs: readonly WatermarkSpec[]): Promise<void> {
    preparedBatches.push([...specs])
    return fakeRasterControls.prepareError === null
      ? Promise.resolve()
      : Promise.reject(fakeRasterControls.prepareError)
  }

  rasterise(page: PageSize): Promise<Uint8Array> {
    rasterisedSizes.push(page)
    return Promise.resolve(markPng())
  }

  close(): void {
    DocumentRasteriser.closed += 1
  }
}

export function resetFakePdfRaster(): void {
  preparedBatches.length = 0
  rasterisedSizes.length = 0
  fakeRasterControls.prepareError = null
  DocumentRasteriser.instances = 0
  DocumentRasteriser.closed = 0
}
