/**
 * Reads a hidden mark out of an image file (M15): decode the file to pixels on
 * a canvas, then hand them to the pure `readInvisibleMark`. The decode is a 2D
 * canvas operation jsdom cannot run, so page tests replace this module with a
 * fake and it is excluded from coverage (see vitest.config.ts / PLAN.md §9).
 */
import { readInvisibleMark } from '../engine/invisible'

export async function readInvisibleFromFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context === null) {
      return null
    }
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return readInvisibleMark(image.data, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}
