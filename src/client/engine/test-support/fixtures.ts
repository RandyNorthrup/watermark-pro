/** Browser-only helpers for engine tests: synthetic bitmaps and pixel probes. */
import { DEFAULT_STYLE, type TextSpec } from '../../../shared/watermark'

/** A plainly visible text mark shared by the engine pixel tests. */
export const textSpecFixture: TextSpec = {
  kind: 'text',
  text: 'PROOF',
  fontFamily: 'sans-serif',
  fontWeight: 700,
  letterSpacing: 0,
  curve: 0,
  effect: 'solid',
  placement: { mode: 'anchor', anchor: 'bottom-right' },
  contrast: { mode: 'auto' },
  style: { ...DEFAULT_STYLE, opacity: 1, scale: 0.3 },
}

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

/** A bitmap with four distinct quadrant colours, for orientation checks. */
export async function quadBitmap(
  width: number,
  height: number,
  colours: { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string },
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('no 2d context')
  }
  const halfWidth = width / 2
  const halfHeight = height / 2
  ctx.fillStyle = colours.topLeft
  ctx.fillRect(0, 0, halfWidth, halfHeight)
  ctx.fillStyle = colours.topRight
  ctx.fillRect(halfWidth, 0, halfWidth, halfHeight)
  ctx.fillStyle = colours.bottomLeft
  ctx.fillRect(0, halfHeight, halfWidth, halfHeight)
  ctx.fillStyle = colours.bottomRight
  ctx.fillRect(halfWidth, halfHeight, halfWidth, halfHeight)
  return await createImageBitmap(canvas)
}

/** The `[r, g, b, a]` of one pixel. */
export function colourAt(
  pixels: ImageData,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * pixels.width + x) * 4
  return [
    pixels.data[offset] ?? 0,
    pixels.data[offset + 1] ?? 0,
    pixels.data[offset + 2] ?? 0,
    pixels.data[offset + 3] ?? 0,
  ]
}

/** Mean luminance (Rec. 709, 0–255) over a rectangle. */
export function meanLuminance(
  pixels: ImageData,
  rect: { x: number; y: number; width: number; height: number },
): number {
  let sum = 0
  let count = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const [r, g, b] = colourAt(pixels, x, y)
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      count += 1
    }
  }
  return count === 0 ? 0 : sum / count
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
