/**
 * Image analysis on a downscaled luminance map. Pure functions over typed
 * arrays so they run identically in a Web Worker, in Node tests, and in the
 * browser. Coordinates are in map pixels; callers convert to image space.
 */

/** Grayscale image as a row-major array of luminance values in [0, 1]. */
export interface LuminanceMap {
  width: number
  height: number
  values: Float32Array
}

/** Axis-aligned box in map pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Typed-array reads are typed `number | undefined` under
 * `noUncheckedIndexedAccess`; every index used here is in range, so the
 * fallback exists for the type system alone.
 */
export function read(values: ArrayLike<number>, index: number): number {
  return values[index] ?? 0
}

/** Largest one-axis Sobel response for inputs in [0, 1]: 1 + 2 + 1. */
const SOBEL_MAX_GRADIENT = 4

/** Rec. 709 luma coefficients; alpha is ignored (assumed opaque photo). */
const LUMA_RED = 0.2126
const LUMA_GREEN = 0.7152
const LUMA_BLUE = 0.0722
const CHANNELS = 4
const MAX_CHANNEL = 255

/** Converts RGBA pixel data into a luminance map. */
export function toLuminanceMap(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): LuminanceMap {
  if (data.length !== width * height * CHANNELS) {
    throw new RangeError('pixel data length does not match the given dimensions')
  }
  const values = new Float32Array(width * height)
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * CHANNELS
    const red = read(data, offset)
    const green = read(data, offset + 1)
    const blue = read(data, offset + 2)
    values[index] = (LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue) / MAX_CHANNEL
  }
  return { width, height, values }
}

/**
 * Sobel gradient magnitude, normalised to [0, 1]. Edge pixels reuse their
 * nearest interior neighbour so the map keeps the input dimensions.
 */
export function sobelMagnitude(map: LuminanceMap): LuminanceMap {
  const { width, height, values } = map
  const out = new Float32Array(width * height)
  const at = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, 0), width - 1)
    const cy = Math.min(Math.max(y, 0), height - 1)
    return read(values, cy * width + cx)
  }
  const maxMagnitude = Math.hypot(SOBEL_MAX_GRADIENT, SOBEL_MAX_GRADIENT)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        -at(x - 1, y - 1) +
        at(x + 1, y - 1) -
        2 * at(x - 1, y) +
        2 * at(x + 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y + 1)
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1)
      out[y * width + x] = Math.hypot(gx, gy) / maxMagnitude
    }
  }
  return { width, height, values: out }
}

/**
 * Summed-area table with one extra row and column of zeros, so any box sum
 * is four lookups. Stored as Float64 to keep precision over large maps.
 */
export interface IntegralImage {
  width: number
  height: number
  sums: Float64Array
}

export function integralImage(map: LuminanceMap, transform: (value: number) => number = (v) => v) {
  const stride = map.width + 1
  const sums = new Float64Array(stride * (map.height + 1))
  for (let y = 1; y <= map.height; y += 1) {
    let rowSum = 0
    for (let x = 1; x <= map.width; x += 1) {
      rowSum += transform(read(map.values, (y - 1) * map.width + (x - 1)))
      sums[y * stride + x] = read(sums, (y - 1) * stride + x) + rowSum
    }
  }
  const integral: IntegralImage = { width: map.width, height: map.height, sums }
  return integral
}

/** Sum of the values inside `box` (clamped to the image). */
export function boxSum(integral: IntegralImage, box: Box): number {
  const stride = integral.width + 1
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(integral.width, Math.ceil(box.x + box.width))
  const y1 = Math.min(integral.height, Math.ceil(box.y + box.height))
  if (x1 <= x0 || y1 <= y0) {
    return 0
  }
  const s = integral.sums
  return (
    read(s, y1 * stride + x1) -
    read(s, y0 * stride + x1) -
    read(s, y1 * stride + x0) +
    read(s, y0 * stride + x0)
  )
}

/** Number of map pixels covered by `box` after clamping. */
export function boxArea(integral: IntegralImage, box: Box): number {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(integral.width, Math.ceil(box.x + box.width))
  const y1 = Math.min(integral.height, Math.ceil(box.y + box.height))
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
}

export interface RegionStats {
  mean: number
  variance: number
}

/** Mean and variance of a region using integral images of values and squares. */
export function regionStats(values: IntegralImage, squares: IntegralImage, box: Box): RegionStats {
  const area = boxArea(values, box)
  if (area === 0) {
    return { mean: 0, variance: 0 }
  }
  const mean = boxSum(values, box) / area
  const meanOfSquares = boxSum(squares, box) / area
  return { mean, variance: Math.max(0, meanOfSquares - mean * mean) }
}
