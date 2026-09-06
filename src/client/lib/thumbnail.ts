import type { Size } from '../engine/layout'

/** Longest side of gallery thumbnails; small enough for a grid, big enough to recognise. */
export const THUMBNAIL_MAX_SIDE = 400
const THUMBNAIL_QUALITY = 0.82

export interface Thumbnail extends Size {
  blob: Blob
}

/** JPEG thumbnail of an image blob, fitted within THUMBNAIL_MAX_SIDE, decoded in the browser. */
export async function createThumbnail(source: Blob): Promise<Thumbnail> {
  const bitmap = await createImageBitmap(source)
  try {
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('2D canvas context is unavailable')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: THUMBNAIL_QUALITY })
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}
