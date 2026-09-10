import { describe, expect, it } from 'vitest'

import { offscreenBackend } from './canvas'
import { applyWatermark } from './pipeline'
import { pixelsOf, splitBitmap, textSpecFixture } from './test-support/fixtures'

const WIDTH = 600
const HEIGHT = 400
const DARK_THRESHOLD = 100
const MIN_CURVE_OFFSET = 10

/** Pixel centroids compare both ends against the middle, independent of layout's arc maths. */
function inkCentre(pixels: ImageData, bands: readonly [number, number][]): number {
  let totalY = 0
  let count = 0
  for (let y = 0; y < pixels.height; y += 1) {
    for (const [left, right] of bands) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * pixels.width + x) * 4
        if ((pixels.data[offset] ?? 255) < DARK_THRESHOLD) {
          totalY += y
          count += 1
        }
      }
    }
  }
  if (count === 0) throw new Error('Expected visible text in the measured band')
  return totalY / count
}

async function bendOffset(curve: number): Promise<number> {
  const source = await splitBitmap(WIDTH, HEIGHT, '#ffffff', '#ffffff')
  try {
    const result = await applyWatermark(
      {
        source,
        marks: [
          {
            spec: {
              ...textSpecFixture,
              text: 'HHHHHHHHH',
              curve,
              placement: { mode: 'anchor', anchor: 'center' },
              contrast: { mode: 'manual', variant: 'dark', outline: 0 },
              style: { ...textSpecFixture.style, scale: 0.6, rotation: 0 },
            },
          },
        ],
        output: { format: 'image/png', quality: 1 },
      },
      offscreenBackend,
    )
    const pixels = await pixelsOf(result.blob)
    const ends = inkCentre(pixels, [
      [120, 180],
      [420, 480],
    ])
    const middle = inkCentre(pixels, [[250, 350]])
    return ends - middle
  } finally {
    source.close()
  }
}

describe('curved text in exported pixels', () => {
  it('bends opposite directions and keeps zero curvature straight', async () => {
    const straight = await bendOffset(0)
    const upward = await bendOffset(0.75)
    const downward = await bendOffset(-0.75)
    expect(Math.abs(straight)).toBeLessThan(3)
    expect(upward).toBeGreaterThan(MIN_CURVE_OFFSET)
    expect(downward).toBeLessThan(-MIN_CURVE_OFFSET)
  })
})
