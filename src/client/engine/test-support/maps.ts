import type { LuminanceMap } from '../analysis'

/** Builds a map from a function of (x, y) in map pixels. */
export function mapFrom(
  width: number,
  height: number,
  value: (x: number, y: number) => number,
): LuminanceMap {
  const values = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = value(x, y)
    }
  }
  return { width, height, values }
}
