/** Browser-only helpers for engine tests: synthetic bitmaps and pixel probes. */

/** A bitmap whose left half is one colour and right half another. */
export async function splitBitmap(
  width: number,
  height: number,
  left: string,
  right: string,
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  ctx.fillStyle = left
  ctx.fillRect(0, 0, width / 2, height)
  ctx.fillStyle = right
  ctx.fillRect(width / 2, 0, width / 2, height)
  return await createImageBitmap(canvas)
}

/** Decodes a blob back into pixels for assertions. */
export async function pixelsOf(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Number of pixels inside a rectangle that differ from a flat colour by more than `tolerance`. */
export function countChanged(
  pixels: ImageData,
  rect: { x: number; y: number; width: number; height: number },
  flat: [number, number, number],
  tolerance = 24,
): number {
  let changed = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * pixels.width + x) * 4
      const delta =
        Math.abs((pixels.data[offset] ?? 0) - flat[0]) +
        Math.abs((pixels.data[offset + 1] ?? 0) - flat[1]) +
        Math.abs((pixels.data[offset + 2] ?? 0) - flat[2])
      if (delta > tolerance) {
        changed += 1
      }
    }
  }
  return changed
}
