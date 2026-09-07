/**
 * Small previews of each named filter applied to the current photo (or the
 * sample scene), for the editor's Adjust tab. Rendered through the same pixel
 * code the engine uses, on the main thread; the caller revokes the URLs.
 */
import { createSamplePhoto } from './sample-photo'
import { FILTERS, type FilterId } from '../../shared/adjustments'
import { adjustPixels } from '../engine/adjust'
import type { CanvasBackend } from '../engine/canvas'

export const FILTER_THUMBNAIL_SIDE = 96
const THUMBNAIL_OUTPUT = { format: 'image/jpeg', quality: 0.7 } as const

/** One JPEG object URL per filter, keyed by filter id. */
export async function renderFilterThumbnails(
  source: ImageBitmap | null,
  backend: CanvasBackend,
): Promise<Map<FilterId, string>> {
  const bitmap = source ?? (await createSamplePhoto(backend))
  const scale = Math.min(1, FILTER_THUMBNAIL_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const base = backend.createCanvas(width, height)
  base.context.drawImage(bitmap, 0, 0, width, height)
  if (source === null) {
    bitmap.close()
  }
  const baseImage = base.context.getImageData(0, 0, width, height)
  const thumbnails = new Map<FilterId, string>()
  for (const filter of FILTERS) {
    const canvas = backend.createCanvas(width, height)
    const image = new ImageData(new Uint8ClampedArray(baseImage.data), width, height)
    adjustPixels(image.data, width, height, filter.adjust)
    canvas.context.putImageData(image, 0, 0)
    const blob = await canvas.encode(THUMBNAIL_OUTPUT)
    thumbnails.set(filter.id, URL.createObjectURL(blob))
  }
  return thumbnails
}
