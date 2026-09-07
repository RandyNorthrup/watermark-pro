/**
 * Pure decision logic for the "Prepare logo" panel, split out from the canvas
 * component (`components/designer/logo-prepare.tsx`) the way `engine/adjust.ts`
 * is split from its canvas caller: no DOM, no canvas, so it runs and earns its
 * coverage in jsdom while the component keeps only the thin, browser-only
 * decode and encode wrappers.
 */
import { type PixelBuffer, removeBackground, trimTransparent } from './logo-cleanup'
import { MAX_CHANNEL, read } from '../engine/analysis'

/** RGBA byte layout, mirrored from the cleanup helpers for the alpha scan. */
const RGBA_CHANNELS = 4
const ALPHA_BYTE_OFFSET = 3

/** The cleanup steps the panel can apply, as chosen in the UI. */
export interface CleanupOptions {
  removeBackground: boolean
  tolerance: number
  trim: boolean
}

/** True when any pixel is less than fully opaque, i.e. the image carries alpha. */
export function hasAlpha(image: PixelBuffer): boolean {
  const { data } = image
  for (let offset = ALPHA_BYTE_OFFSET; offset < data.length; offset += RGBA_CHANNELS) {
    if (read(data, offset) < MAX_CHANNEL) {
      return true
    }
  }
  return false
}

/** The prepared file keeps its original base name but always becomes a PNG. */
export function toPngName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return `${base}.png`
}

/** A "width × height" readout for the output-size line. */
export function describeSize(width: number, height: number): string {
  return `${String(width)} × ${String(height)}`
}

/**
 * Applies the chosen cleanup steps in order: background removal, then a
 * transparent-margin trim, returning the cleaned pixels. The trim is skipped
 * when it would erase the whole image (an all-transparent result is the cleanup
 * helpers' 0×0 contract), so the buffer is never left empty. When neither step
 * is chosen the input is returned unchanged. Pure; unit-tested in jsdom.
 */
export function runCleanup(image: PixelBuffer, options: CleanupOptions): PixelBuffer {
  const base = options.removeBackground ? removeBackground(image, options.tolerance) : image
  if (!options.trim) {
    return base
  }
  const cropped = trimTransparent(base)
  return cropped.width > 0 && cropped.height > 0 ? cropped : base
}
