/**
 * Pure decisions behind PDF rasterisation, split out from the canvas-bound
 * `raster.ts` the way `lib/logo-prepare-pipeline.ts` is split from its canvas
 * component: no DOM, no canvas, so these run and earn their coverage in the
 * jsdom project while `raster.ts` keeps only the OffscreenCanvas drawing.
 *
 * A page's size is in PDF points (1/72 inch); the marks are drawn at
 * `PDF_RASTER_DPI`, so the raster canvas is sized in pixels here. Pages of the
 * same size share one raster, and smart placement — meaningless over a blank
 * page — falls back to a bottom-right anchor.
 */
import { PDF_POINTS_PER_INCH, PDF_RASTER_DPI } from '../../shared/constants'
import type { WatermarkSpec } from '../../shared/watermark'

/** A PDF page size in points (1 point = 1/72 inch). */
export interface PageSize {
  width: number
  height: number
}

/** A raster canvas size in device pixels. */
export interface PixelSize {
  width: number
  height: number
}

/**
 * Pixel dimensions of the raster for a page of `size`, at `dpi`. Points are
 * 1/72 inch, so a pixel is `dpi / 72` points; never smaller than one pixel.
 */
export function pixelDimensions(size: PageSize, dpi = PDF_RASTER_DPI): PixelSize {
  const scale = dpi / PDF_POINTS_PER_INCH
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * A grouping key for a page size, rounded to whole points: pages within a
 * fraction of a point share one raster, and the sub-point difference vanishes
 * when the raster is drawn back at each page's exact size.
 */
export function sizeKey(size: PageSize): string {
  return `${String(Math.round(size.width))}x${String(Math.round(size.height))}`
}

/** One distinct page size and the key every page of that size shares. */
export interface DistinctSize {
  key: string
  size: PageSize
}

/**
 * The distinct page sizes in `sizes`, in first-seen order, so the marks are
 * rasterised once per size rather than once per page.
 */
export function distinctPageSizes(sizes: readonly PageSize[]): DistinctSize[] {
  const seen = new Set<string>()
  const distinct: DistinctSize[] = []
  for (const size of sizes) {
    const key = sizeKey(size)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    distinct.push({ key, size })
  }
  return distinct
}

/** Whether a spec would place its mark by smart analysis, which documents fall back from. */
export function hasSmartPlacement(spec: WatermarkSpec): boolean {
  return spec.placement.mode === 'smart'
}

/**
 * The spec to draw on a document page. Smart placement analyses the photo it
 * sits on; over a blank page it has nothing to read, so it becomes a
 * bottom-right anchor. Every other placement mode is drawn unchanged.
 */
export function documentSpec(spec: WatermarkSpec): WatermarkSpec {
  if (spec.placement.mode === 'smart') {
    return { ...spec, placement: { mode: 'anchor', anchor: 'bottom-right' } }
  }
  return spec
}
