/**
 * Colour adjustments applied to raw RGBA pixels. Pure arithmetic over a
 * `Uint8ClampedArray`, so it runs in a worker, on the main thread and in Node
 * tests. Brightness and contrast fold into one lookup table; saturation,
 * warmth and sepia fold into one 3×3 matrix and offset; vignette is spatial.
 */
import { LUMA_BLUE, LUMA_GREEN, LUMA_RED, MAX_CHANNEL, read } from './analysis'
import {
  type Adjustments,
  BRIGHTNESS_RANGE,
  isIdentityAdjustments,
  SEPIA_MATRIX,
  VIGNETTE_INNER,
  WARMTH_RANGE,
} from '../../shared/adjustments'

const CHANNELS = 4
const MIDPOINT = 128
const LUT_SIZE = 256
/** Pixel centres sit half a unit inside the grid; the vignette measures from there. */
const PIXEL_CENTRE = 0.5
/** Smoothstep polynomial `t²(3 − 2t)`. */
const SMOOTHSTEP_CUBIC = 3
const SMOOTHSTEP_QUADRATIC = 2

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
]
type Vector3 = readonly [number, number, number]

const IDENTITY_3: Matrix3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

const INDICES = [0, 1, 2] as const

function multiply3(a: Matrix3, b: Matrix3): Matrix3 {
  return INDICES.map((row) =>
    INDICES.map(
      (column) => a[row][0] * b[0][column] + a[row][1] * b[1][column] + a[row][2] * b[2][column],
    ),
  ) as unknown as Matrix3
}

function transform3(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ]
}

/** Brightness then contrast, as a 256-entry lookup shared by the three channels. */
function toneLut(brightness: number, contrast: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LUT_SIZE)
  const shift = brightness * BRIGHTNESS_RANGE
  const gain = 1 + contrast
  for (let value = 0; value < LUT_SIZE; value += 1) {
    lut[value] = (value + shift - MIDPOINT) * gain + MIDPOINT
  }
  return lut
}

/**
 * The linear colour transform (saturation, then warmth, then sepia) as a
 * single matrix and offset applied to `(R, G, B)` in `[0, 255]`.
 */
export function colourMatrix(adjust: Adjustments): { matrix: Matrix3; offset: Vector3 } {
  const luma = [LUMA_RED, LUMA_GREEN, LUMA_BLUE] as const
  const saturation: Matrix3 = INDICES.map((channel) =>
    INDICES.map(
      (source) =>
        (1 + adjust.saturation) * (channel === source ? 1 : 0) - adjust.saturation * luma[source],
    ),
  ) as unknown as Matrix3
  const warmthOffset: Vector3 = [WARMTH_RANGE * adjust.warmth, 0, -WARMTH_RANGE * adjust.warmth]
  const sepia: Matrix3 =
    adjust.sepia === 0
      ? IDENTITY_3
      : (INDICES.map((row) =>
          INDICES.map(
            (column) =>
              (1 - adjust.sepia) * (row === column ? 1 : 0) +
              adjust.sepia * SEPIA_MATRIX[row][column],
          ),
        ) as unknown as Matrix3)
  // v3 = sepia · (saturation · v + warmthOffset) = (sepia · saturation) · v + sepia · warmthOffset
  return { matrix: multiply3(sepia, saturation), offset: transform3(sepia, warmthOffset) }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (SMOOTHSTEP_CUBIC - SMOOTHSTEP_QUADRATIC * t)
}

/** Applies `adjust` to `data` in place. A no-op for the identity adjustment. */
export function adjustPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adjust: Adjustments,
): void {
  if (isIdentityAdjustments(adjust)) {
    return
  }
  const lut = toneLut(adjust.brightness, adjust.contrast)
  const { matrix, offset } = colourMatrix(adjust)
  const isColourIdentity = adjust.saturation === 0 && adjust.warmth === 0 && adjust.sepia === 0
  const hasVignette = adjust.vignette > 0
  const centreX = width / 2
  const centreY = height / 2
  // width and height are at least 1, so the corner distance is always positive.
  const cornerDistance = Math.hypot(centreX, centreY)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offsetPixel = (y * width + x) * CHANNELS
      let red = read(lut, read(data, offsetPixel))
      let green = read(lut, read(data, offsetPixel + 1))
      let blue = read(lut, read(data, offsetPixel + 2))
      if (!isColourIdentity) {
        const nextRed = matrix[0][0] * red + matrix[0][1] * green + matrix[0][2] * blue + offset[0]
        const nextGreen =
          matrix[1][0] * red + matrix[1][1] * green + matrix[1][2] * blue + offset[1]
        const nextBlue = matrix[2][0] * red + matrix[2][1] * green + matrix[2][2] * blue + offset[2]
        red = nextRed
        green = nextGreen
        blue = nextBlue
      }
      if (hasVignette) {
        const dx = x + PIXEL_CENTRE - centreX
        const dy = y + PIXEL_CENTRE - centreY
        const radius = Math.hypot(dx, dy) / cornerDistance
        const factor = 1 - adjust.vignette * smoothstep(VIGNETTE_INNER, 1, radius)
        red *= factor
        green *= factor
        blue *= factor
      }
      data[offsetPixel] = red
      data[offsetPixel + 1] = green
      data[offsetPixel + 2] = blue
    }
  }
}

/** Luminance of one channel triple, matching the analysis map. */
export function channelLuminance(red: number, green: number, blue: number): number {
  return (LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue) / MAX_CHANNEL
}
