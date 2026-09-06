export interface ImageSize {
  width: number
  height: number
}

/**
 * Decodes just enough of an image file to learn its pixel size. Throws for
 * files the browser cannot decode, which is the signal the upload form uses
 * to reject non-images before they reach the server.
 */
export async function readImageSize(file: Blob): Promise<ImageSize> {
  const bitmap = await createImageBitmap(file)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}
