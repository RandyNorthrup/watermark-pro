/**
 * Reads a hidden mark out of an image file (M15): decode the file to pixels on
 * a canvas, then hand them to the pure `readInvisibleMark`. Real browser tests
 * cover decoding and distinguish an absent mark from an unavailable reader.
 */
import { readInvisibleMark } from '../engine/invisible'

export class InvisibleReadError extends Error {
  override readonly name = 'InvisibleReadError'
}

export async function readInvisibleFromFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new InvisibleReadError(
        'This browser could not open a canvas to check the image. Try again in a supported browser.',
      )
    }
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return readInvisibleMark(image.data, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}
