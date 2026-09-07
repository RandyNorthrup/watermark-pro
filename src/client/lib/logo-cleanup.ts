/**
 * Pure image-cleanup helpers for the logo-prepare tool. Every function takes
 * and returns a plain, ImageData-shaped RGBA buffer and never touches the DOM,
 * a canvas, or a Workers global, so they run identically in the browser, in a
 * worker, and in Node/jsdom tests where they earn their coverage.
 *
 * `removeBackground` clears a flat backdrop by flooding inward from the four
 * corners; `alphaBounds`/`trimTransparent` measure and crop away the resulting
 * transparent margins.
 */
import {
  ALPHA_TRIM_THRESHOLD,
  DEFAULT_BACKGROUND_TOLERANCE,
  MAX_BACKGROUND_TOLERANCE,
} from '../../shared/constants'
import { read } from '../engine/analysis'

/** RGBA byte layout. */
const CHANNELS = 4
const RED_OFFSET = 0
const GREEN_OFFSET = 1
const BLUE_OFFSET = 2
const ALPHA_OFFSET = 3

/** Fully cleared background pixels. */
const TRANSPARENT_ALPHA = 0
/** Half-opaque alpha for the one-pixel feather ring around a cleared region. */
const FEATHER_ALPHA = 128

/** Flood-fill flag stored per pixel; the typed array defaults to unmatched. */
const FLAG_MATCHED = 1

/** The eight-connected neighbour offsets, `[dx, dy]`. */
const NEIGHBOURS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

/** An ImageData-shaped RGBA buffer, with no dependency on the DOM. */
export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** An axis-aligned box in pixels. */
export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Euclidean RGB distance between the pixels at two byte offsets. */
function colourDistance(data: Uint8ClampedArray, offsetA: number, offsetB: number): number {
  const deltaRed = read(data, offsetA + RED_OFFSET) - read(data, offsetB + RED_OFFSET)
  const deltaGreen = read(data, offsetA + GREEN_OFFSET) - read(data, offsetB + GREEN_OFFSET)
  const deltaBlue = read(data, offsetA + BLUE_OFFSET) - read(data, offsetB + BLUE_OFFSET)
  return Math.hypot(deltaRed, deltaGreen, deltaBlue)
}

/** State a single flood shares across every pixel it visits. */
interface FloodContext {
  data: Uint8ClampedArray
  width: number
  height: number
  seedOffset: number
  tolerance: number
  matched: Uint8Array
  stack: number[]
}

/**
 * Matches every unvisited eight-connected neighbour of `pixel` that lies within
 * the flood's tolerance of the seed colour, pushing each onto the stack. Kept as
 * its own function so the flood's inner loop is not nested inside another loop.
 */
function visitNeighbours(context: FloodContext, pixel: number): void {
  const { data, width, height, seedOffset, tolerance, matched, stack } = context
  const pixelX = pixel % width
  const pixelY = (pixel - pixelX) / width
  for (const [deltaX, deltaY] of NEIGHBOURS) {
    const neighbourX = pixelX + deltaX
    const neighbourY = pixelY + deltaY
    if (neighbourX < 0 || neighbourY < 0 || neighbourX >= width || neighbourY >= height) {
      continue
    }
    const neighbour = neighbourY * width + neighbourX
    if (read(matched, neighbour) === FLAG_MATCHED) {
      continue
    }
    if (colourDistance(data, neighbour * CHANNELS, seedOffset) <= tolerance) {
      matched[neighbour] = FLAG_MATCHED
      stack.push(neighbour)
    }
  }
}

/**
 * Removes a flat background by flooding inward from the corners.
 *
 * Each corner seeds an eight-connected flood whose matched pixels lie within
 * `tolerance` (RGB distance) of that corner's colour. A corner is only added as
 * a distinct seed when its colour differs from every seed already taken by more
 * than `tolerance`, so the common uniform backdrop collapses to a single seed
 * while genuinely different corners each get their own flood.
 *
 * Matched pixels are cleared to transparent; a matched pixel that touches any
 * unmatched (kept) pixel keeps a one-pixel feather at half alpha instead. The
 * input is never mutated: a fresh buffer is returned.
 */
export function removeBackground(
  image: PixelBuffer,
  tolerance: number = DEFAULT_BACKGROUND_TOLERANCE,
): PixelBuffer {
  const { data, width, height } = image
  const output = new Uint8ClampedArray(data)
  const pixelCount = width * height
  if (pixelCount === 0) {
    return { data: output, width, height }
  }
  const limit = Math.min(MAX_BACKGROUND_TOLERANCE, Math.max(0, tolerance))
  const lastX = width - 1
  const lastY = height - 1
  const cornerPixels = [0, lastX, lastY * width, lastY * width + lastX]

  const seedPixels: number[] = []
  for (const corner of cornerPixels) {
    const cornerOffset = corner * CHANNELS
    const isDistinct = seedPixels.every(
      (seed) => colourDistance(data, cornerOffset, seed * CHANNELS) > limit,
    )
    if (isDistinct) {
      seedPixels.push(corner)
    }
  }

  const matched = new Uint8Array(pixelCount)
  const stack: number[] = []
  for (const seed of seedPixels) {
    if (read(matched, seed) === FLAG_MATCHED) {
      continue
    }
    matched[seed] = FLAG_MATCHED
    stack.push(seed)
    const context: FloodContext = {
      data,
      width,
      height,
      seedOffset: seed * CHANNELS,
      tolerance: limit,
      matched,
      stack,
    }
    while (stack.length > 0) {
      visitNeighbours(context, stack.pop() ?? 0)
    }
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (read(matched, pixel) !== FLAG_MATCHED) {
      continue
    }
    const pixelX = pixel % width
    const pixelY = (pixel - pixelX) / width
    const hasKeptNeighbour = NEIGHBOURS.some(([deltaX, deltaY]) => {
      const neighbourX = pixelX + deltaX
      const neighbourY = pixelY + deltaY
      if (neighbourX < 0 || neighbourY < 0 || neighbourX >= width || neighbourY >= height) {
        return false
      }
      return read(matched, neighbourY * width + neighbourX) !== FLAG_MATCHED
    })
    output[pixel * CHANNELS + ALPHA_OFFSET] = hasKeptNeighbour ? FEATHER_ALPHA : TRANSPARENT_ALPHA
  }

  return { data: output, width, height }
}

/**
 * Bounding box of the pixels whose alpha exceeds `ALPHA_TRIM_THRESHOLD`.
 *
 * Empty-case contract: when no such pixel exists (an all-transparent buffer, or
 * one with zero area), the box is the zero-size `{ x: 0, y: 0, width: 0,
 * height: 0 }`.
 */
export function alphaBounds(image: PixelBuffer): PixelBounds {
  const { data, width, height } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = read(data, (y * width + x) * CHANNELS + ALPHA_OFFSET)
      if (alpha > ALPHA_TRIM_THRESHOLD) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX < 0 || maxY < 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Crops `image` to `alphaBounds`, dropping fully transparent margins. An image
 * with no visible pixel yields a zero-size buffer (the empty-case contract of
 * `alphaBounds`). The input is never mutated: a fresh buffer is returned.
 */
export function trimTransparent(image: PixelBuffer): PixelBuffer {
  const bounds = alphaBounds(image)
  if (bounds.width === 0 || bounds.height === 0) {
    return { data: new Uint8ClampedArray(0), width: 0, height: 0 }
  }
  const { data, width } = image
  const rowBytes = bounds.width * CHANNELS
  const output = new Uint8ClampedArray(rowBytes * bounds.height)
  for (let row = 0; row < bounds.height; row += 1) {
    const sourceStart = ((bounds.y + row) * width + bounds.x) * CHANNELS
    output.set(data.subarray(sourceStart, sourceStart + rowBytes), row * rowBytes)
  }
  return { data: output, width: bounds.width, height: bounds.height }
}
